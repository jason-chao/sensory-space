import type { Sim } from "../core/sim";
import { COMMON, MAIN, getScene } from "./scenes";

/** Maximum change in regional relative luminance per second. A flash is a pair
 *  of opposing changes of 0.1 or more (WCAG 2.3.1). At this rate one such pair
 *  takes at least 0.57 s, so no more than about 1.75 can occur in any second,
 *  below the limit of 3. The limiter is the last stage before the screen, so it
 *  holds for every scene, transition and input. */
export const LUMA_SLEW_PER_S = 0.35;
/** The regional grid on which luminance is limited. */
export const GRID_W = 16;
export const GRID_H = 9;

// (declared before the shaders that use it)
const VERT = `#version 300 es
in vec2 aPos; out vec2 vUv;
void main(){ vUv=aPos*.5+.5; gl_Position=vec4(aPos,0.,1.); }`;

const LUM = `
vec3 toLin(vec3 c){ c=max(c,0.); return mix(c/12.92,pow((c+.055)/1.055,vec3(2.4)),step(.04045,c)); }
vec3 toSrgb(vec3 c){ c=max(c,0.); return mix(c*12.92,1.055*pow(c,vec3(1./2.4))-.055,step(.0031308,c)); }
float lum(vec3 lin){ return dot(lin,vec3(.2126,.7152,.0722)); }`;

const COMPOSITE = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 o;
uniform sampler2D uA; uniform sampler2D uB; uniform float uMix; uniform float uBright; uniform float uSat;
uniform float uMask; uniform float uAsp; uniform vec4 uTouch[8]; uniform vec3 uTouchCol[8];
${LUM}
void main(){
  vec3 c=texture(uA,vUv).rgb;
  if(uMix>0.) c=mix(c,texture(uB,vUv).rgb,uMix);
  float g=dot(c,vec3(.2126,.7152,.0722));
  c=mix(vec3(g),c,uSat);
  vec2 p=vec2((vUv.x-.5)*uAsp,vUv.y-.5);
  // touches: a soft bloom that opens and fades where the space was touched
  for(int i=0;i<8;i++){
    float age=uTouch[i].z; if(age<0.) continue;
    float d=length(p-uTouch[i].xy);
    float r=.04+.16*sqrt(age);
    float env=smoothstep(0.,.5,age)*exp(-age/2.8);
    c+=uTouchCol[i]*env*(exp(-d*d/(r*r))*.35+.25*exp(-abs(d-r)*30.));
  }
  c*=uBright;
  if(uMask>0.){ float rad=mix(1.2,.28,uMask); c*=smoothstep(rad,rad*.55,length(p)); }
  c=clamp(c,0.,1.);
  o=vec4(c,lum(toLin(c)));   // alpha carries linear luminance: its mip levels are true regional means
}`;

/** Limiter, step 1: for each region of the grid, how far the picture may move
 *  from what is on screen towards what the scene wants in this frame.
 *  1 = follow freely, less = dissolve more slowly. */
const ALPHA = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 o;
uniform sampler2D uScene; uniform sampler2D uPrev; uniform float uLod; uniform float uMaxStep; uniform vec2 uCell;
void main(){
  float want=0., have=0.;
  for(int y=0;y<4;y++) for(int x=0;x<4;x++){
    vec2 uv=vUv+(vec2(x,y)-1.5)*.25*uCell;
    want+=textureLod(uScene,uv,uLod).a; have+=textureLod(uPrev,uv,uLod).a;
  }
  float d=abs(want-have)/16.;
  float a=min(1.,uMaxStep/max(d,1e-6));
  o=vec4(sqrt(a),0.,0.,1.);
}`;

/** Limiter, step 2: each region takes the most cautious value among itself and
 *  its neighbours, so interpolation across region borders can never exceed a region's own limit. */
const ALPHAMIN = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 o;
uniform sampler2D uAlpha; uniform vec2 uCell;
void main(){
  float m=1.;
  for(int y=-1;y<=1;y++) for(int x=-1;x<=1;x++) m=min(m,texture(uAlpha,vUv+vec2(x,y)*uCell).r);
  o=vec4(m,0.,0.,1.);
}`;

/** Limiter, step 3: the new picture is a blend in linear light of the previous
 *  output and the scene. A rate-limited region dissolves; it never cuts. */
const BLEND = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 o;
uniform sampler2D uScene; uniform sampler2D uPrev; uniform sampler2D uAlpha; uniform float uFrame;
${LUM}
float h(vec2 p){ p=fract(p*vec2(123.34,456.21)); p+=dot(p,p+45.32); return fract(p.x*p.y); }
void main(){
  float a=texture(uAlpha,vUv).r; a*=a;
  vec3 c=mix(toLin(texture(uPrev,vUv).rgb),toLin(texture(uScene,vUv).rgb),a);
  // red guard: keep saturated red below the red-flash criterion R/(R+G+B) >= 0.8
  float sum=c.r+c.g+c.b;
  if(sum>1e-4 && c.r/sum>.74){ float add=(c.r/.74-sum)*.5; c.g+=add; c.b+=add; }
  c=clamp(c,0.,1.);
  // noise below one 8-bit step: lets a slow dissolve finish instead of stalling on rounding
  float n=(h(gl_FragCoord.xy+uFrame)-.5)/255.;
  o=vec4(toSrgb(c)+n,lum(c));
}`;

const PRESENT = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 o;
uniform sampler2D uImg; uniform vec2 uOut;
float h(vec2 p){ p=fract(p*vec2(123.34,456.21)); p+=dot(p,p+45.32); return fract(p.x*p.y); }
void main(){
  vec3 s=textureLod(uImg,vUv,0.).rgb;
  vec2 px=vUv*uOut;
  s+=(h(px)+h(px+17.3)-1.)/255.;               // dither: removes banding on slow gradients
  o=vec4(s,1.);
}`;

interface Target {
  fb: WebGLFramebuffer;
  tex: WebGLTexture;
  w: number;
  h: number;
}

interface SceneProg {
  prog: WebGLProgram;
  u: Record<string, WebGLUniformLocation | null>;
}

export class VisualEngine {
  readonly gl: WebGL2RenderingContext;
  private quad: WebGLVertexArrayObject;
  private scenes = new Map<string, SceneProg | null>();
  private composite: SceneProg;
  private alpha: SceneProg;
  private alphaMin: SceneProg;
  private blend: SceneProg;
  private present: SceneProg;
  private tA!: Target;
  private tB!: Target;
  /** per slot: two buffers for scenes that read their previous frame, and the scene they belong to */
  private fb: { t: Target[]; idx: number; scene: string }[] = [];
  private tMix!: Target;
  private tAlpha!: Target;
  private tAlphaMin!: Target;
  private out: Target[] = [];
  private outIdx = 0;
  private frame = 0;
  private touchBuf = new Float32Array(32);
  private noTouch = new Float32Array(32).fill(-1);
  private touchCol = new Float32Array(24);
  /** internal render scale relative to the canvas backing size */
  scale = 1;
  maxWidth = 1920;
  private frameMs = 16;
  private lastScaleChange = 0;
  autoScale = true;
  /** test only: proves the flash check can fail */
  bypassLimiter = false;
  error: string | null = null;

  constructor(readonly canvas: HTMLCanvasElement, private sim: Sim) {
    const gl = canvas.getContext("webgl2", { alpha: false, antialias: false, powerPreference: "high-performance", preserveDrawingBuffer: false });
    if (!gl) throw new Error("WebGL2 is not available in this browser");
    this.gl = gl;
    this.quad = gl.createVertexArray()!;
    gl.bindVertexArray(this.quad);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    this.composite = this.program(COMPOSITE, ["uA", "uB", "uMix", "uBright", "uSat", "uMask", "uAsp", "uTouch", "uTouchCol"])!;
    this.alpha = this.program(ALPHA, ["uScene", "uPrev", "uLod", "uMaxStep", "uCell"])!;
    this.alphaMin = this.program(ALPHAMIN, ["uAlpha", "uCell"])!;
    this.blend = this.program(BLEND, ["uScene", "uPrev", "uAlpha", "uFrame"])!;
    this.present = this.program(PRESENT, ["uImg", "uOut"])!;
    this.tAlpha = this.target(GRID_W, GRID_H, "byte");
    this.tAlphaMin = this.target(GRID_W, GRID_H, "byte");
    this.resize(true);
  }

  private program(frag: string, uniforms: string[]): SceneProg | null {
    const gl = this.gl;
    const mk = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        this.error = gl.getShaderInfoLog(s) ?? "shader error";
        console.error(this.error);
        return null;
      }
      return s;
    };
    const vs = mk(gl.VERTEX_SHADER, VERT), fs = mk(gl.FRAGMENT_SHADER, frag);
    if (!vs || !fs) return null;
    const prog = gl.createProgram()!;
    gl.attachShader(prog, vs); gl.attachShader(prog, fs);
    gl.bindAttribLocation(prog, 0, "aPos");
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      this.error = gl.getProgramInfoLog(prog) ?? "link error";
      console.error(this.error);
      return null;
    }
    const u: Record<string, WebGLUniformLocation | null> = {};
    for (const n of uniforms) u[n] = gl.getUniformLocation(prog, n);
    return { prog, u };
  }

  private sceneProg(id: string): SceneProg | null {
    if (!this.scenes.has(id)) {
      const def = getScene(id);
      this.scenes.set(id, this.program(COMMON + def.glsl + MAIN,
        ["uRes", "uT", "uTime", "uSeed", "uDensity", "uA", "uB", "uBreath", "uPal", "uTouch", "uPrev", "uDt"]));
    }
    return this.scenes.get(id) ?? null;
  }

  /** compile every scene; returns the ids that failed (used by tests) */
  compileAll(ids: string[]): string[] {
    return ids.filter((id) => this.sceneProg(id) === null);
  }

  private target(w: number, h: number, kind: "byte" | "mip"): Target {
    const gl = this.gl;
    const tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, kind === "mip" ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const fb = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    if (kind === "mip") gl.generateMipmap(gl.TEXTURE_2D);
    return { fb, tex, w, h };
  }

  private free(t?: Target): void {
    if (!t) return;
    this.gl.deleteFramebuffer(t.fb);
    this.gl.deleteTexture(t.tex);
  }

  resize(force = false): void {
    const c = this.canvas;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cw = Math.max(2, Math.round(c.clientWidth * dpr)), ch = Math.max(2, Math.round(c.clientHeight * dpr));
    if (c.width !== cw || c.height !== ch) { c.width = cw; c.height = ch; force = true; }
    const cap = Math.min(1, this.maxWidth / cw);
    const w = Math.max(2, Math.round(cw * this.scale * cap)), h = Math.max(2, Math.round(ch * this.scale * cap));
    if (!force && this.tA && this.tA.w === w && this.tA.h === h) return;
    this.free(this.tA); this.free(this.tB); this.free(this.tMix);
    this.tA = this.target(w, h, "byte");
    this.tB = this.target(w, h, "byte");
    this.tMix = this.target(w, h, "mip");
    // the limiter's memory of what is on screen is carried over, so a resize cannot cause a jump
    const old = this.out[this.outIdx];
    const fresh = [this.target(w, h, "mip"), this.target(w, h, "mip")];
    if (old) {
      const gl = this.gl;
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, old.fb);
      gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, fresh[0].fb);
      gl.blitFramebuffer(0, 0, old.w, old.h, 0, 0, w, h, gl.COLOR_BUFFER_BIT, gl.LINEAR);
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
      gl.bindTexture(gl.TEXTURE_2D, fresh[0].tex);
      gl.generateMipmap(gl.TEXTURE_2D);
    }
    this.out.forEach((t) => this.free(t));
    this.out = fresh; this.outIdx = 0;
  }

  /** draws a scene; returns the texture holding the result */
  private drawScene(id: string, seed: number, to: Target, slot: number, dt: number): WebGLTexture {
    const gl = this.gl, sim = this.sim;
    const p = this.sceneProg(id);
    let prevTex: WebGLTexture | null = null;
    if (getScene(id).feedback) {
      let f = this.fb[slot];
      if (!f || f.t[0].w !== to.w || f.t[0].h !== to.h || f.scene !== id) {
        f?.t.forEach((t) => this.free(t));
        f = { t: [this.target(to.w, to.h, "byte"), this.target(to.w, to.h, "byte")], idx: 0, scene: id };
        this.fb[slot] = f;
      }
      prevTex = f.t[f.idx].tex;
      f.idx = 1 - f.idx;
      to = f.t[f.idx];
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, to.fb);
    gl.viewport(0, 0, to.w, to.h);
    if (!p) { gl.clear(gl.COLOR_BUFFER_BIT); return to.tex; }
    gl.useProgram(p.prog);
    gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, prevTex);
    gl.uniform1i(p.u.uPrev, 3);
    gl.uniform1f(p.u.uDt, Math.min(dt, 0.1));
    gl.uniform4fv(p.u.uTouch, this.touchBuf);
    gl.uniform2f(p.u.uRes, to.w, to.h);
    gl.uniform1f(p.u.uT, sim.phase);
    gl.uniform1f(p.u.uTime, sim.t);
    gl.uniform1f(p.u.uSeed, seed);
    gl.uniform1f(p.u.uDensity, sim.v("v.density"));
    gl.uniform1f(p.u.uA, sim.v(`sc.${id}.a`));
    gl.uniform1f(p.u.uB, sim.v(`sc.${id}.b`));
    gl.uniform1f(p.u.uBreath, sim.breath);
    gl.uniform3fv(p.u.uPal, sim.pal);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    return to.tex;
  }

  /** dt: seconds of simulation covered by this frame (bounds the limiter step) */
  render(dt: number): void {
    const gl = this.gl, sim = this.sim;
    this.resize();
    gl.bindVertexArray(this.quad);

    const asp = this.tA.w / this.tA.h;
    for (let i = 0; i < 8; i++) {
      const tc = sim.touches[i];
      this.touchBuf[i * 4 + 2] = -1;
      if (!tc || sim.t - tc.t > 14) continue;
      this.touchBuf.set([(tc.x - 0.5) * asp, tc.y - 0.5, sim.t - tc.t, 0], i * 4);
      for (let k = 0; k < 3; k++) {
        this.touchCol[i * 3 + k] = Math.min(1, Math.max(0, sim.pal[k] + sim.pal[3 + k] * Math.cos(6.28318 * (sim.pal[6 + k] * tc.x + sim.pal[9 + k]))));
      }
    }

    const texA = this.drawScene(sim.sceneA, sim.visSeedA, this.tA, 0, dt);
    const mixing = sim.sceneB !== null;
    const texB = mixing ? this.drawScene(sim.sceneB!, sim.visSeedB, this.tB, 1, dt) : this.tB.tex;

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.tMix.fb);
    gl.viewport(0, 0, this.tMix.w, this.tMix.h);
    gl.useProgram(this.composite.prog);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, texA);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, texB);
    gl.uniform1i(this.composite.u.uA, 0); gl.uniform1i(this.composite.u.uB, 1);
    const m = sim.mix;
    gl.uniform1f(this.composite.u.uMix, mixing ? m * m * (3 - 2 * m) : 0);
    gl.uniform1f(this.composite.u.uBright, (0.25 + 0.95 * sim.v("v.brightness")) * (1 - sim.blank));
    gl.uniform1f(this.composite.u.uMask, sim.v("v.mask"));
    gl.uniform1f(this.composite.u.uAsp, this.tMix.w / this.tMix.h);
    // scenes that answer touches themselves get no generic bloom on top
    const own = getScene(sim.sceneA).ownTouch && (!mixing || getScene(sim.sceneB!).ownTouch);
    gl.uniform4fv(this.composite.u.uTouch, own ? this.noTouch : this.touchBuf);
    gl.uniform3fv(this.composite.u.uTouchCol, this.touchCol);
    gl.uniform1f(this.composite.u.uSat, 0.15 + 1.0 * sim.v("v.saturation"));
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.tMix.tex);
    gl.generateMipmap(gl.TEXTURE_2D);
    // a mip level whose texels are at most a quarter of a region: 4x4 taps then give the region's mean
    const lod = Math.max(0, Math.floor(Math.log2(this.tMix.w / GRID_W)) - 2);
    const prev = this.out[this.outIdx], next = this.out[1 - this.outIdx];

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.tAlpha.fb);
    gl.viewport(0, 0, GRID_W, GRID_H);
    gl.useProgram(this.alpha.prog);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, prev.tex);
    gl.uniform1i(this.alpha.u.uScene, 0); gl.uniform1i(this.alpha.u.uPrev, 1);
    gl.uniform1f(this.alpha.u.uLod, lod);
    gl.uniform2f(this.alpha.u.uCell, 1 / GRID_W, 1 / GRID_H);
    gl.uniform1f(this.alpha.u.uMaxStep, this.bypassLimiter ? 9 : LUMA_SLEW_PER_S * Math.min(dt, 0.05));
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.tAlphaMin.fb);
    gl.useProgram(this.alphaMin.prog);
    gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, this.tAlpha.tex);
    gl.uniform1i(this.alphaMin.u.uAlpha, 2);
    gl.uniform2f(this.alphaMin.u.uCell, 1 / GRID_W, 1 / GRID_H);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    gl.bindFramebuffer(gl.FRAMEBUFFER, next.fb);
    gl.viewport(0, 0, next.w, next.h);
    gl.useProgram(this.blend.prog);
    gl.bindTexture(gl.TEXTURE_2D, this.tAlphaMin.tex);
    gl.uniform1i(this.blend.u.uScene, 0); gl.uniform1i(this.blend.u.uPrev, 1); gl.uniform1i(this.blend.u.uAlpha, 2);
    gl.uniform1f(this.blend.u.uFrame, (this.frame = (this.frame + 1) % 997));
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, next.tex);
    gl.generateMipmap(gl.TEXTURE_2D);
    this.outIdx = 1 - this.outIdx;

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.useProgram(this.present.prog);
    gl.uniform1i(this.present.u.uImg, 1);
    gl.uniform2f(this.present.u.uOut, this.canvas.width, this.canvas.height);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  /** a transition finished: the incoming scene's buffers move to the main slot */
  promoteSlot(): void {
    this.fb[0]?.t.forEach((t) => this.free(t));
    this.fb[0] = this.fb[1];
    this.fb.length = 1;
  }

  /** forget what is on screen: the picture then fades in again from black */
  resetLimiter(): void {
    const gl = this.gl;
    for (const t of this.out) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, t.fb);
      gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
      gl.bindTexture(gl.TEXTURE_2D, t.tex); gl.generateMipmap(gl.TEXTURE_2D);
    }
  }

  /** lower the internal resolution when frames are slow, raise it when there is headroom */
  reportFrame(ms: number, now: number): void {
    this.frameMs += (ms - this.frameMs) * 0.05;
    if (!this.autoScale || now - this.lastScaleChange < 2500) return;
    if (this.frameMs > 24 && this.scale > 0.3) { this.scale = Math.max(0.3, this.scale * 0.8); this.lastScaleChange = now; }
    else if (this.frameMs < 13 && this.scale < 1) { this.scale = Math.min(1, this.scale * 1.15); this.lastScaleChange = now; }
  }

  /** Regional relative luminance of what is on screen right now, on the limiter
   *  grid. Used by the automated flash check; must be called right after render. */
  readLuma(): number[] {
    const gl = this.gl;
    const w = this.canvas.width, h = this.canvas.height;
    const px = new Uint8Array(w * h * 4);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
    const out = new Array(GRID_W * GRID_H).fill(0), cnt = new Array(GRID_W * GRID_H).fill(0);
    const lin = (v: number) => { const s = v / 255; return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); };
    for (let y = 0; y < h; y++) {
      const gy = Math.min(GRID_H - 1, Math.floor((y / h) * GRID_H));
      for (let x = 0; x < w; x++) {
        const gx = Math.min(GRID_W - 1, Math.floor((x / w) * GRID_W));
        const i = (y * w + x) * 4;
        out[gy * GRID_W + gx] += 0.2126 * lin(px[i]) + 0.7152 * lin(px[i + 1]) + 0.0722 * lin(px[i + 2]);
        cnt[gy * GRID_W + gx]++;
      }
    }
    return out.map((v, i) => v / Math.max(1, cnt[i]));
  }
}
