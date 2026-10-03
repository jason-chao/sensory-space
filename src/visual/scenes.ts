/** Scenes are pure functions of (position, time, seed, parameters). They keep no
 *  state between frames, which makes replay exact and lets the safety pass treat
 *  every scene identically. To add a scene, append an entry to SCENES. */
export interface SceneParam {
  label: string;
  def: number;
}
export interface SceneDef {
  id: string;
  label: string;
  blurb: string;
  a?: SceneParam;
  b?: SceneParam;
  /** the scene reads its own previous frame as uPrev (trails, flow). Replay of such scenes is approximate. */
  feedback?: boolean;
  /** the scene answers touches itself, so the generic bloom is not drawn over it */
  ownTouch?: boolean;
  /** kept in the code but not offered: not in the picker, not stepped to, not chosen by automatic changes */
  hidden?: boolean;
  /** GLSL defining: vec3 scene(vec2 p, float t) */
  glsl: string;
}

export const COMMON = /* glsl */ `#version 300 es
precision highp float;
uniform vec2 uRes;
uniform float uT;       // scene phase: advances with the speed control
uniform float uTime;    // real session seconds
uniform float uSeed;
uniform float uDensity;
uniform float uA;
uniform float uB;
uniform float uBreath;  // 0..1 breathing curve
uniform vec3 uPal[4];
uniform vec4 uTouch[8]; // x, y (same units as p), age in seconds, unused; age < 0 = empty
uniform sampler2D uPrev; // previous frame of this scene (feedback scenes only)
uniform float uDt;      // seconds since the previous frame
uniform vec4 uTrail[24]; // where a finger has been dragged: x, y, age in seconds, speed
uniform vec2 uTrailV[24]; // its velocity there
uniform int uTrailN;
out vec4 outColor;
float asp;
vec2 toUv(vec2 p){ return vec2(p.x/asp+.5,p.y+.5); }
// --- the finger's wake. Scenes use these so that dragging has a physical, predictable effect.
// how strongly the recent drag touches p (0..1), fading with age
float wake(vec2 p,float radius){
  float m=0.;
  for(int i=0;i<24;i++){ if(i>=uTrailN) break; vec4 s=uTrail[i]; float d=length(p-s.xy);
    m=max(m,exp(-d*d/(radius*radius))*exp(-s.z/1.2)); }
  return m;
}
// displacement that pushes things away from the finger's path and along its direction of travel
vec2 wakePush(vec2 p,float radius,float strength){
  vec2 d=vec2(0.);
  for(int i=0;i<24;i++){ if(i>=uTrailN) break; vec4 s=uTrail[i]; vec2 r=p-s.xy; float dist=length(r);
    float w=exp(-dist*dist/(radius*radius))*exp(-s.z/1.2);
    d+=(r/max(dist,1e-3))*w*strength+uTrailV[i]*w*strength*.35; }
  float l=length(d); return l>strength*1.5?d*(strength*1.5/l):d;   // never more than a hand's width
}
// pull towards the finger's most recent positions (for things that follow a hand)
vec2 wakePull(vec2 p,float radius,float strength){
  vec2 d=vec2(0.);
  for(int i=0;i<24;i++){ if(i>=uTrailN) break; vec4 s=uTrail[i]; vec2 r=s.xy-p; float dist=length(r);
    float w=exp(-dist*dist/(radius*radius))*exp(-s.z/.8);
    d+=r*w*strength; }
  return d;
}
// a swirl around the finger's path, turning in the direction it moved (for stirring colour)
vec2 wakeSwirl(vec2 p,float radius,float strength){
  for(int i=0;i<24;i++){ if(i>=uTrailN) break; vec4 s=uTrail[i]; vec2 r=p-s.xy; float dist=length(r);
    float w=exp(-dist*dist/(radius*radius))*exp(-s.z/1.5);
    vec2 v=uTrailV[i]; float side=sign(v.x*r.y-v.y*r.x+1e-6);
    float a=w*strength*side*min(1.,s.w);
    float c=cos(a), sn=sin(a); p=s.xy+mat2(c,-sn,sn,c)*r; }
  return p;
}

vec3 pal(float t){ return clamp(uPal[0]+uPal[1]*cos(6.28318*(uPal[2]*t+uPal[3])),0.,1.); }
float h11(float n){ return fract(sin(n*127.1+3.3)*43758.5453); }
float h21(vec2 p){ p=fract(p*vec2(123.34,456.21)); p+=dot(p,p+45.32); return fract(p.x*p.y); }
vec2 h22(vec2 p){ float n=h21(p); return vec2(n,h21(p+n+17.17)); }
float vnoise(vec2 p){ vec2 i=floor(p),f=fract(p); f=f*f*(3.-2.*f);
  return mix(mix(h21(i),h21(i+vec2(1,0)),f.x),mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x),f.y); }
float fbm(vec2 p){ float a=.5,s=0.; for(int i=0;i<5;i++){ s+=a*vnoise(p); p=mat2(1.6,1.2,-1.2,1.6)*p; a*=.5; } return s; }
`;

export const MAIN = /* glsl */ `
void main(){
  asp=uRes.x/uRes.y;
  vec2 p=(gl_FragCoord.xy-.5*uRes)/uRes.y;
  outColor=vec4(clamp(scene(p,uT),0.,1.),1.);
}`;

export const SCENES: SceneDef[] = [
  {
    id: "aurora", label: "Aurora", blurb: "Slow curtains of light over a night sky",
    a: { label: "Curtain height", def: 0.5 },
    glsl: `
vec3 scene(vec2 p,float t){
  p+=wakePush(p,.25,.07);
  vec3 c=mix(vec3(.01,.015,.04),vec3(.03,.05,.09),smoothstep(-.5,.5,p.y));
  vec2 g=p*38.; vec2 id=floor(g); float st=h21(id+uSeed);
  vec2 f=fract(g)-.5-(h22(id)-.5)*.6;
  c+=smoothstep(.07,.0,length(f))*step(.92,st)*(.5+.5*sin(uTime*.3+st*40.))*.45;
  for(int i=0;i<6;i++){
    float fi=float(i); float w=clamp(uDensity*5.+1.5-fi,0.,1.); if(w<=0.) break;
    float x=p.x*(.7+.15*fi)+fi*3.7+uSeed;
    float y=-.3+.11*fi+.36*(fbm(vec2(x*.6+t*.04,t*.03+fi*5.))-.5);
    float d=p.y-y;
    float curtain=.5+.5*vnoise(vec2(x*5.+t*.15,t*.1+fi));
    float band=d>0.?exp(-d*(7.-4.*uA)):exp(-d*d*160.);
    c+=pal(.12*fi+.08*p.x+t*.01)*band*curtain*w*.4;
  }
  return c;
}`,
  },
  {
    id: "lava", label: "Lava lamp", blurb: "Soft blobs that rise, merge and part",
    a: { label: "Blob size", def: 0.5 },
    glsl: `
vec3 scene(vec2 p,float t){
  float f=0.;
  for(int i=0;i<12;i++){
    float fi=float(i); float w=clamp(uDensity*10.+2.-fi,0.,1.); if(w<=0.) break;
    vec2 h=h22(vec2(fi*1.3+.7,uSeed+2.1));
    vec2 c=vec2((h.x-.5)*1.05*asp+.22*sin(t*.11*(.6+h.y)+fi*2.),.62*sin(t*(.05+.06*h.x)+fi*1.7+h.y*6.28));
    c+=wakePull(c,.4,.3);   // blobs follow a hand, stretch between where it was and where it is, and split
    float r=(.10+.10*h.y)*(.7+.6*uA);
    f+=w*r*r/(dot(p-c,p-c)+1e-4);
  }
  float m=smoothstep(.9,1.25,f); float glow=smoothstep(.15,1.,f);
  vec3 bg=pal(.55+.1*p.y)*.09;
  float fc=min(f,3.);
  vec3 blob=pal(.1+.1*fc+.25*p.y+t*.008);
  return mix(bg+blob*glow*.2,blob*(.55+.12*fc),m);
}`,
  },
  {
    id: "fireflies", label: "Fireflies", blurb: "Drifting points of light with depth",
    a: { label: "Glow size", def: 0.4 },
    glsl: `
vec3 scene(vec2 p,float t){
  vec3 c=pal(.6+.15*p.y)*.07*(1.-.5*length(p));
  for(int L=0;L<3;L++){
    float fl=float(L); float sc=3.+fl*2.5;
    vec2 q=p*sc+vec2(t*.02*(fl+1.),fl*10.+uSeed); vec2 id=floor(q); vec2 fq=fract(q);
    for(int y=-1;y<=1;y++) for(int x=-1;x<=1;x++){
      vec2 o=vec2(x,y); vec2 h=h22(id+o+fl*31.);
      float present=smoothstep(h.x-.05,h.x+.05,.2+.75*uDensity);
      vec2 pos=o+.5+.38*vec2(sin(t*(.2+.3*h.x)+h.y*6.28),cos(t*(.17+.25*h.y)+h.x*6.28));
      vec2 wp=(id+pos-vec2(t*.02*(fl+1.),fl*10.+uSeed))/sc;   // world position of this firefly
      pos+=wakePush(wp,.28,.11)*sc;                                 // nudged aside by a passing finger
      float d=length(fq-pos);
      float tw=.45+.55*sin(uTime*(.25+.5*h.y)+h.x*40.); tw*=tw;
      float s=.07*(.5+1.2*uA);
      float gl=pow(s*s/(d*d+s*s),1.3);
      c+=pal(h.x*.3+.1*fl)*gl*tw*present*(1.-.25*fl)*1.5;
    }
  }
  return c;
}`,
  },
  {
    id: "caustics", label: "Pool light", blurb: "Sunlight rippling on the floor of a pool",
    a: { label: "Light strength", def: 0.5 },
    glsl: `
float web(vec2 p,float t){
  vec2 w=vec2(fbm(p+vec2(t*.07,0.)),fbm(p+vec2(5.2,1.3)-vec2(0.,t*.06)));
  float n=fbm(p*1.3+2.2*w+uSeed);
  float r=1.-abs(2.*n-1.);
  return pow(r,14.);
}
vec3 scene(vec2 p,float t){
  p=wakeSwirl(p,.25,.7);
  float sc=1.6+2.6*uDensity;
  float a=web(p*sc,t), b=web(p*sc*1.4+7.,t*1.3);
  float c=min(a,b)*1.6+.5*a*b+.12*(a+b);
  vec3 base=pal(.5+.1*p.y+.05*sin(t*.05));
  return base*(.3+.15*fbm(p*2.+t*.02))+c*mix(base,vec3(1.),.35)*(.35+.6*uA);
}`,
  },
  {
    id: "ink", label: "Ink in water", blurb: "Colour unfolding slowly through water",
    a: { label: "Depth", def: 0.5 },
    glsl: `
vec3 scene(vec2 p,float t){
  p=wakeSwirl(p,.28,.7);
  vec2 q0=p*(.9+1.8*uDensity)+uSeed;
  vec2 q=vec2(fbm(q0+vec2(0.,t*.05)),fbm(q0+vec2(5.2,1.3)-t*.04));
  vec2 r=vec2(fbm(q0+3.5*q+vec2(1.7,9.2)+t*.03),fbm(q0+3.5*q+vec2(8.3,2.8)-t*.025));
  float f=fbm(q0+3.5*r);
  vec3 c=pal(f*.9+.3*length(q)+t*.006);
  c=mix(c,pal(.5+r.x*.6),.5*smoothstep(.2,.8,r.y));
  c*=.2+.9*smoothstep(.1,.8,f*f*2.+.4*q.x);
  return c*(.55+.6*uA);
}`,
  },
  {
    id: "orb", label: "Breathing orb", blurb: "Grows as you breathe in, settles as you breathe out",
    a: { label: "Guide ring", def: 0.5 },
    glsl: `
vec3 scene(vec2 p,float t){
  p+=wakePush(p,.3,.06);
  float b=uBreath; float R=.15+.17*b; float d=length(p);
  vec3 c=pal(.6+.1*d)*(.05+.05*b);
  float core=smoothstep(R,R*.15,d);
  float halo=exp(-max(d-R,0.)*(6.-2.5*b));
  float sw=fbm(p*2.5/(R+.2)+vec2(t*.05,-t*.04)+uSeed);
  c+=pal(.15+.25*sw+.1*b)*core*(.5+.35*b);
  c+=pal(.35+.1*b)*halo*.3*(.45+.55*b);
  c+=smoothstep(.005,.0,abs(d-.33))*.14*uA;
  return c;
}`,
  },
  {
    id: "stars", label: "Night sky", blurb: "Stars and faint clouds, almost still",
    a: { label: "Cloud glow", def: 0.5 },
    glsl: `
vec3 scene(vec2 p,float t){
  p+=wakePush(p,.25,.06);
  vec2 dr=vec2(t*.01,t*.004);
  float n=fbm(p*1.2+dr*2.+uSeed); float n2=fbm(p*2.5-dr*3.+n);
  vec3 c=pal(.2+.5*n)*pow(n2,2.)*.8*(.3+1.2*uA)+vec3(.008,.01,.025);
  for(int L=0;L<3;L++){
    float fl=float(L); float sc=13.+fl*15.;
    vec2 q=p*sc+dr*sc*(.6+fl*.3)+fl*17.; vec2 id=floor(q); vec2 h=h22(id+uSeed);
    float present=smoothstep(h.x-.03,h.x+.03,.12+.6*uDensity);
    vec2 f=fract(q)-.5-(h-.5)*.7; float dd=length(f); float s=.03+.06*h.y*h.x;
    float tw=.6+.4*sin(uTime*(.2+.6*h.y)+h.x*50.);
    c+=present*tw*pow(s*s/(dd*dd+s*s),1.6)*mix(vec3(1.),pal(h.y),.35)*(1.-.22*fl)*1.5;
  }
  return c;
}`,
  },
  {
    id: "ripples", label: "Rain on a pond", blurb: "Rings spreading from gentle drops",
    a: { label: "Shine", def: 0.5 },
    glsl: `
vec3 scene(vec2 p,float t){
  float h=0.; vec2 q=p*(1.4+2.2*uDensity)+uSeed; vec2 id=floor(q);
  for(int y=-2;y<=2;y++) for(int x=-2;x<=2;x++){
    vec2 cid=id+vec2(x,y); vec2 hh=h22(cid);
    float tt=t*.9/(5.+6.*hh.x)+hh.y; float cyc=floor(tt); float ph=fract(tt);
    vec2 c=cid+.5+(h22(cid+cyc*7.31)-.5)*.8;
    float d=length(q-c); float rad=ph*2.1;
    float env=(1.-ph)*(1.-ph)*smoothstep(0.,.06,ph);
    h+=sin((d-rad)*13.)*exp(-abs(d-rad)*5.)*env;
  }
  vec3 base=pal(.55+.08*p.y+.03*h);
  return base*(.34+.1*fbm(p*1.5+t*.02))+mix(pal(.3),vec3(1.),.3)*max(h,0.)*.6*(.4+uA)-.05*max(-h,0.);
}`,
  },
  {
    id: "bubbles", label: "Bubbles", blurb: "Clear bubbles floating upward",
    a: { label: "Bubble size", def: 0.5 },
    glsl: `
vec3 scene(vec2 p,float t){
  vec3 c=pal(.6+.12*p.y)*(.13+.07*p.y);
  for(int L=0;L<3;L++){
    float fl=float(L); float sc=2.2+fl*1.6;
    vec2 q=vec2(p.x*sc+fl*3.3+uSeed,p.y*sc); float cx=floor(q.x);
    for(int x=-1;x<=1;x++){
      float id=cx+float(x); vec2 h=h22(vec2(id,fl*9.+1.));
      float present=smoothstep(h.x-.05,h.x+.05,.2+.75*uDensity);
      float yy=fract(h.x*7.+t*(.03+.05*h.y))*1.7-.85;
      float r=(.12+.22*h.y)*(.6+.8*uA);
      vec2 bc=vec2(id+.5+.25*sin(t*.3*(1.+h.x)+h.y*6.),yy*sc);
      bc+=wakePush((bc-vec2(fl*3.3+uSeed,0.))/sc,.3,.12)*sc;
      vec2 dv=q-bc;
      float d=length(dv);
      float inside=smoothstep(r,r*.92,d);
      float rim=inside*smoothstep(r*.55,r,d);
      float hl=smoothstep(r*.3,0.,length(dv-vec2(-.35,.4)*r));
      float fade=smoothstep(.85,.6,abs(yy));
      c+=present*fade*(pal(h.y*.4+.1)*(rim*.5+inside*.1)+hl*.3*inside)*(1.-.2*fl);
    }
  }
  return c;
}`,
  },
  {
    id: "bokeh", label: "Lanterns", blurb: "Large soft discs of light, drifting",
    a: { label: "Disc size", def: 0.5 },
    glsl: `
vec3 scene(vec2 p,float t){
  vec3 c=pal(.7)*.04;
  for(int i=0;i<14;i++){
    float fi=float(i); float w=clamp(uDensity*12.+2.-fi,0.,1.); if(w<=0.) break;
    vec2 h=h22(vec2(fi*1.7+.3,uSeed+.9)); vec2 h2=h22(vec2(uSeed+3.,fi*2.3+.1));
    vec2 ctr=vec2((h.x-.5)*1.1*asp+.2*sin(t*.05*(1.+h.y)+fi),(h.y-.5)*.9+.15*cos(t*.04*(1.+h.x)+fi*2.));
    ctr+=wakePush(ctr,.4,.16);
    float r=(.08+.2*h2.x)*(.6+.8*uA); float d=length(p-ctr);
    float disc=smoothstep(r,r*.88,d); float edge=smoothstep(r*.8,r,d)*disc;
    float pulse=.6+.4*sin(uTime*(.1+.15*h2.y)+fi*3.);
    c+=w*pal(h2.y*.6+t*.004)*(disc*.3+edge*.14)*pulse;
  }
  return c;
}`,
  },
  {
    id: "kaleido", label: "Kaleidoscope", blurb: "Mirrored colour, unfolding without spinning",
    a: { label: "Mirrors", def: 0.3 },
    glsl: `
vec3 fold(vec2 p,float t,float n){
  float a=atan(p.y,p.x); float r=length(p); float seg=6.28318/n;
  a=mod(a,seg); a=abs(a-seg*.5);
  vec2 q=r*vec2(cos(a),sin(a))*(1.5+2.5*uDensity)+vec2(t*.04,0.)+uSeed;
  vec2 w=vec2(fbm(q+t*.02),fbm(q+vec2(3.1,7.7)-t*.02));
  float f=fbm(q+2.5*w);
  vec3 c=pal(f*1.2+r*.3-t*.01);
  c*=.15+.85*smoothstep(.25,.75,f+.2*w.x);
  return c*smoothstep(1.5,.2,r);
}
vec3 scene(vec2 p,float t){
  p=wakeSwirl(p,.3,.8);
  // the mirror count changes by cross-fading, never by a jump
  float m=4.+uA*8.; float n=floor(m); float k=smoothstep(.35,.65,fract(m));
  vec3 c=fold(p,t,n);
  if(k>0.) c=mix(c,fold(p,t,n+1.),k);
  return c;
}`,
  },
  {
    id: "threads", label: "Silk threads", blurb: "Glowing lines swaying like slow water plants",
    a: { label: "Shimmer", def: 0.4 },
    glsl: `
vec3 scene(vec2 p,float t){
  vec3 c=pal(.65)*.035;
  for(int i=0;i<10;i++){
    float fi=float(i); float w=clamp(uDensity*9.+1.5-fi,0.,1.); if(w<=0.) break;
    float h=h11(fi+uSeed);
    float y=(h-.5)*.75+.12*sin(p.x*(1.2+h)+t*(.12+.1*h)+fi)+.07*sin(p.x*2.7-t*.09+fi*2.)+.03*(.3+uA)*sin(p.x*6.+t*.2+fi*5.);
    y+=wakePush(vec2(p.x,y),.28,.14).y;   // lines bend away from a hand like water plants
    float d=abs(p.y-y);
    float g=.0035/(d+.0035)*.55+exp(-d*18.)*.18;
    c+=w*pal(.1*fi+.15*p.x+t*.01)*g*.5;
  }
  return c;
}`,
  },
  {
    id: "mosaic", label: "Sea glass", blurb: "Soft cells of colour that slowly shift",
    a: { label: "Edge softness", def: 0.5 },
    glsl: `
vec3 scene(vec2 p,float t){
  p+=wakePush(p,.22,.08);
  vec2 q=p*(2.2+4.5*uDensity)+uSeed; vec2 id=floor(q), f=fract(q);
  float d1=9.,d2=9.; vec2 cid=id;
  for(int y=-1;y<=1;y++) for(int x=-1;x<=1;x++){
    vec2 o=vec2(x,y); vec2 h=h22(id+o);
    vec2 c=o+.5+.4*vec2(sin(t*.15*(.5+h.x)+h.y*6.28),cos(t*.13*(.5+h.y)+h.x*6.28));
    float d=length(c-f);
    if(d<d1){ d2=d1; d1=d; cid=id+o; } else if(d<d2) d2=d;
  }
  float edge=smoothstep(0.,.1+.25*uA,d2-d1); float hh=h21(cid);
  return pal(hh*.7+.05*sin(t*.05+hh*6.28))*(.22+.55*edge)*(.7+.3*(1.-d1));
}`,
  },
  {
    id: "wash", label: "Colour wash", blurb: "The quietest scene: a slow field of colour",
    a: { label: "Texture", def: 0.3 },
    glsl: `
vec3 scene(vec2 p,float t){
  p=wakeSwirl(p,.3,.5);
  float n=fbm(p*(.4+1.2*uA)+vec2(t*.03,-t*.02)+uSeed);
  float g=p.y*.35+.5+.5*(n-.5);
  return pal(g*.6+t*.008)*(.5+.3*n)*(.5+.5*uDensity);
}`,
  },
  {
    id: "lamps", label: "Resonating lamps", blurb: "Touch a lamp: its colour and light travel to the others",
    a: { label: "Ambient glow", def: 0.3 }, ownTouch: true,
    glsl: `
vec3 scene(vec2 p,float t){
  vec3 c=vec3(.01,.008,.012);
  for(int L=0;L<2;L++){
    float fl=float(L); float sc=4.+fl*3.; vec2 off=vec2(fl*.5+uSeed,fl*.37);
    vec2 q=p*sc+off; vec2 id=floor(q);
    for(int y=-1;y<=1;y++) for(int x=-1;x<=1;x++){
      vec2 cid=id+vec2(x,y); vec2 h=h22(cid+fl*7.);
      float present=smoothstep(h.x-.05,h.x+.05,.2+.5*uDensity);
      vec2 lp=cid+.5+(h-.5)*.5; vec2 wp=(lp-off)/sc;
      vec2 d=q-lp-vec2(.02*sin(t*.5+h.y*6.28),0.); d.y*=.6; float r=length(d);
      float glow=wake(wp,.22)*1.2;
      for(int k=0;k<8;k++){
        float age=uTouch[k].z; if(age<0.) continue;
        float dist=length(wp-uTouch[k].xy); float xx=age-dist/.4; if(xx<0.) continue;
        glow+=smoothstep(0.,.5,xx)*exp(-xx/3.)*smoothstep(2.5,0.,dist);
      }
      float amb=.12+.1*sin(t*.2+h.x*6.28)+.3*uA;
      float lit=amb+glow*1.2;
      vec3 col=mix(pal(.08+.05*h.y),pal(.3+.4*fract(h.x+glow*.1)),clamp(glow,0.,1.));
      float body=smoothstep(.22,.1,r); float halo=exp(-r*r*5.)*.5;
      c+=present*col*(body*lit*.8+halo*lit*.35)*(1.-.35*fl);
    }
  }
  return c;
}`,
  },
  {
    id: "flowers", label: "Flowers", blurb: "Flowers bud, open and scatter in an endless cycle; a touch sends petals flying",
    a: { label: "Flower size", def: 0.5 }, ownTouch: true,
    glsl: `
float petal(vec2 d,float R,float k,float rot){
  float a=atan(d.y,d.x)+rot; float r=length(d);
  float rr=R*(.55+.45*abs(cos(a*k*.5)));
  return smoothstep(rr,rr*.6,r);
}
vec3 scene(vec2 p,float t){
  vec3 c=pal(.6+.1*p.y)*.06;
  float sc=2.+2.5*uDensity; vec2 q=p*sc+uSeed; vec2 id=floor(q);
  for(int y=-1;y<=1;y++) for(int x=-1;x<=1;x++){
    vec2 cid=id+vec2(x,y); vec2 h=h22(cid);
    float P=22.+20.*h.y; float tt=t/P+h.x; float cyc=floor(tt); float ph=fract(tt);
    vec2 h2=h22(cid+cyc*3.7); vec2 ctr=cid+.5+(h2-.5)*.6;
    ctr+=wakePush((ctr-uSeed)/sc,.25,.09)*sc;
    vec2 d=q-ctr;
    float k=4.+floor(h2.x*4.);
    float R=(.12+.25*h2.y)*(.5+uA)*smoothstep(0.,.25,ph)*(1.-smoothstep(.58,.66,ph));
    if(R>.001){
      float f=petal(d,R,k,t*.05*(h.x-.5));
      float inner=smoothstep(R*.35,0.,length(d));
      c+=pal(h2.x*.5+.1)*f*(.6+.3*(1.-length(d)/R))+pal(h2.x*.5+.35)*inner*.5;
    }
    float s=(ph-.6)/.3;
    if(s>0.&&s<1.){
      for(int i=0;i<6;i++){
        float fi=float(i); float ang=fi*1.047+h2.x*6.28; vec2 dir=vec2(cos(ang),sin(ang));
        vec2 pp=ctr+dir*(.15+.5*s)+vec2(.3*s*s*(h.x-.3),.25*s)+.05*sin(vec2(t*1.3+fi,t*1.1+fi*2.));
        pp+=wakePush((pp-uSeed)/sc,.3,.25)*sc;
        for(int kk=0;kk<8;kk++){
          if(uTouch[kk].z<0.) continue;
          vec2 dd=pp-(uTouch[kk].xy*sc+uSeed); float dist=length(dd);
          pp+=dd/max(dist,.1)*.5*s*smoothstep(1.5,0.,dist)*exp(-uTouch[kk].z/3.);
        }
        vec2 e=q-pp; e=mat2(cos(ang),sin(ang),-sin(ang),cos(ang))*e; e.y*=2.2;
        c+=pal(h2.x*.5+.1)*smoothstep(.07,.03,length(e))*(1.-s)*.8;
      }
    }
  }
  return c;
}`,
  },
  {
    id: "flow", label: "Water of light", blurb: "Lines of light flowing like water, parting around a touch",
    a: { label: "Current", def: 0.5 }, feedback: true, ownTouch: true,
    glsl: `
vec2 field(vec2 p,float t){
  float n1=fbm(p*1.3+vec2(0.,t*.03)+uSeed); float n2=fbm(p*1.3+vec2(5.,t*.03)+uSeed+9.);
  vec2 v=vec2(n1-.5,n2-.5)*2.2+vec2(0.,-.25);
  for(int k=0;k<8;k++){
    if(uTouch[k].z<0.) continue;
    vec2 d=p-uTouch[k].xy; float r=length(d);
    v+=d/max(r,.08)*.35*smoothstep(.7,0.,r)*exp(-uTouch[k].z/4.);
  }
  for(int i=0;i<24;i++){ if(i>=uTrailN) break; vec4 s=uTrail[i]; float d=length(p-s.xy); v+=uTrailV[i]*1.2*exp(-d*d/.03)*exp(-s.z/1.5); }   // a drag becomes a current
  return v*(.3+.9*uA);
}
vec3 scene(vec2 p,float t){
  vec2 v=field(p,t);
  vec2 su=toUv(p-v*uDt*1.5);
  // beyond the edge there is nothing to carry in; a small constant fade stops faint haze from lingering
  vec3 prev=(su.x<0.||su.x>1.||su.y<0.||su.y>1.)?vec3(0.):max(texture(uPrev,su).rgb-.25*uDt,0.);
  // pushing light outward also spreads it thin: fade it where a touch is parting the water
  float part=0.;
  for(int k=0;k<8;k++){ if(uTouch[k].z<0.) continue; part+=6.*smoothstep(.7,0.,length(p-uTouch[k].xy))*exp(-uTouch[k].z/4.); }
  prev*=exp(-uDt*part);
  float n=8.+8.*uDensity; vec2 q=p*n; vec2 id=floor(q); float slice=floor(t*2.);
  vec2 h=h22(id+slice*.37+uSeed);
  float on=step(.92,h.x)*smoothstep(0.,.2,fract(t*2.));
  // the light is laid down along the distance it travelled this frame, so trails stay continuous
  vec2 e=id+.5+(h-.5)*.8; vec2 e2=e-v*uDt*1.5*n; vec2 ab=e2-e;
  float u=clamp(dot(q-e,ab)/max(dot(ab,ab),1e-6),0.,1.); float d=length(q-e-ab*u);
  vec3 c=prev*exp(-uDt*1.1)+pal(.3+.4*h.y+p.y*.2)*on*smoothstep(.14,0.,d)*1.4;
  return max(c,pal(.6)*.03);
}`,
  },
  {
    id: "strokes", label: "Brush strokes", blurb: "Ink strokes drawn slowly in space, then fading",
    a: { label: "Stroke weight", def: 0.5 },
    glsl: `
float segd(vec2 p,vec2 a,vec2 b,out float u){ vec2 ab=b-a; u=clamp(dot(p-a,ab)/max(dot(ab,ab),1e-6),0.,1.); return length(p-a-ab*u); }
vec3 scene(vec2 p,float t){
  p+=wakePush(p,.22,.08);
  vec3 c=pal(.6)*.05+.02*fbm(p*3.+uSeed);
  for(int j=0;j<6;j++){
    float fj=float(j); float w=clamp(uDensity*6.+2.-fj,0.,1.); if(w<=0.) break;
    float P=14.+6.*h11(fj+uSeed); float tt=t/P+fj*.37; float cyc=floor(tt); float ph=fract(tt);
    vec2 h=h22(vec2(fj,cyc+uSeed)); vec2 pt=vec2((h.x-.5)*asp*.9,(h.y-.5)*.6);
    float ang=h21(vec2(cyc,fj))*6.28;
    float reveal=smoothstep(0.,.55,ph)*10.; float fade=1.-smoothstep(.75,.95,ph);
    float ink=0.;
    for(int i=0;i<10;i++){
      float fi=float(i); ang+=(vnoise(vec2(fi*.7+cyc*3.,fj*5.+uSeed))-.5)*1.6;
      vec2 nx=pt+vec2(cos(ang),sin(ang))*.11*(.5+uA);
      float vis=clamp(reveal-fi,0.,1.); if(vis<=0.) break;
      float u; float d=segd(p,pt,mix(pt,nx,vis),u);
      float th=.012+.025*sin((fi+u)/10.*3.14159)*(.5+uA);
      ink=max(ink,smoothstep(th,th*.4,d)); pt=nx;
    }
    c=mix(c,pal(.1+.15*fj+.05*cyc),ink*(.7+.3*fbm(p*12.+fj))*fade*w*.9);
  }
  return c;
}`,
  },
  {
    id: "lattice", label: "Light lattice", blurb: "Waves of colour passing through a deep grid of points",
    a: { label: "Wave speed", def: 0.4 }, ownTouch: true,
    glsl: `
vec3 scene(vec2 p,float t){
  vec3 c=vec3(.004,.004,.01);
  float n=3.5+3.*uDensity;
  for(int L=0;L<5;L++){
    float fl=float(L); float z=1.+fl*.6;
    vec2 q=p*z*n+vec2(uSeed+fl*.5,fl*.3); vec2 id=floor(q); vec2 f=fract(q)-.5;
    vec3 w3=vec3((id-vec2(uSeed+fl*.5,fl*.3))/n/z,fl*.4);
    float wave=pow(.5+.5*sin(dot(w3,vec3(1.5,.9,2.))+t*.6*(.3+uA)),3.);
    float wave2=pow(.5+.5*sin(dot(w3,vec3(-.8,1.6,1.))-t*.4*(.3+uA)),4.);
    float tr=wake(w3.xy,.2)*1.5;
    for(int k=0;k<8;k++){
      if(uTouch[k].z<0.) continue;
      float xx=uTouch[k].z*.5-length(w3.xy-uTouch[k].xy);
      tr+=smoothstep(0.,.1,xx)*exp(-xx*3.);
    }
    float b=.05+wave*.6+wave2*.4+tr*1.2;
    float d=length(f); float s=.06+.04*b; float pt=pow(s*s/(d*d+s*s),1.5);
    c+=pt*b*mix(pal(.1+.3*wave+.04*fl),pal(.6+.3*wave2),wave2)*(1.-.15*fl)*.7;
  }
  return c;
}`,
  },
  {
    id: "julia", label: "Fractal garden", blurb: "Soft fronds of a fractal, slowly breathing",
    a: { label: "Zoom", def: 0.35 }, hidden: true,   // viewers found it uneasy; withdrawn until it is reworked
    glsl: `
vec3 scene(vec2 p,float t){
  // the seed wanders slowly around a point where the set stays whole and rounded, never dust
  float a=t*.015+uSeed; vec2 c=vec2(-.123,.745)+.05*vec2(cos(a),sin(a*.7));
  vec2 z=p*(2.1-1.2*uA); float it=0.; float m2=0.; float tr=9.;
  float maxIt=10.+18.*uDensity;   // few iterations: smooth bands rather than fine, crystalline edges
  for(int i=0;i<32;i++){
    if(float(i)>=maxIt) break;
    z=vec2(z.x*z.x-z.y*z.y,2.*z.x*z.y)+c; m2=dot(z,z);
    if(m2>64.) break; it+=1.; tr=min(tr,m2);
  }
  vec3 outside=pal(.6+.1*p.y)*.22;    // a quiet lit ground, not a void
  if(m2<=64.){ float q=sqrt(tr); return mix(pal(.35+.4*q+t*.003),vec3(1.),.15)*(.65+.3*q); }   // inside: lit and pale, brighter towards the heart
  float v=clamp((it+4.-log2(log2(m2)))/maxIt,0.,1.);
  float band=smoothstep(.0,.9,v);
  return mix(outside,pal(.2+.6*band+t*.003)*(.45+.4*band),band*.85);
}`,
  },
  {
    id: "waves", label: "Rolling waves", blurb: "Slow swells drawn as flowing lines, like a woodblock sea",
    a: { label: "Swell", def: 0.5 },
    glsl: `
vec3 scene(vec2 p,float t){
  vec3 c=pal(.62)*.14+.04*fbm(p*2.+vec2(t*.01,0.)+uSeed);   // a pale sky
  for(int i=0;i<7;i++){
    float fi=float(i); float depth=fi/6.;
    float w=clamp(uDensity*6.+1.5-fi,0.,1.); if(w<=0.) break;
    float ph=t*.3*(.7+.1*fi)+fi*1.7+uSeed;
    float sw=sin(p.x*(1.6+.25*fi)+ph); sw+=.35*sin(2.*(p.x*(1.6+.25*fi)+ph)+1.2);   // a leaning swell, steeper on one side
    float y=.4-.125*fi+(.05+.06*uA)*sw+.02*sin(p.x*4.1-ph*1.3+fi)+.015*(fbm(vec2(p.x*2.+fi*5.,ph*.1))-.5);
    for(int k=0;k<8;k++){
      if(uTouch[k].z<0.) continue;
      float age=uTouch[k].z; float dist=abs(p.x-uTouch[k].x);
      y+=.04*sin(dist*9.-age*3.)*exp(-dist*2.5)*exp(-age/2.5)*smoothstep(0.,.3,age);   // a touch sends a ripple along the swell
    }
    y+=.06*wake(vec2(p.x,y),.3);   // a hand lifts the swell
    float d=p.y-y;
    float inside=smoothstep(.004,-.004,d);
    vec3 body=mix(pal(.5+.05*fi),pal(.7+.04*fi),depth)*(.55+.45*depth)*(.85+.15*smoothstep(-.3,0.,d));
    float crest=smoothstep(.012,0.,abs(d))*.5;                              // a soft pale line along the crest
    float line1=smoothstep(.004,0.,abs(d+.03))*.12, line2=smoothstep(.004,0.,abs(d+.065))*.08;   // faint lines under the crest
    c=mix(c,body,inside*w);
    c+=w*(crest+ (line1+line2)*inside)*mix(pal(.85),vec3(1.),.5);
  }
  return c;
}`,
  },
  {
    id: "dots", label: "Infinite dots", blurb: "Fields of soft dots at many depths, slowly pulsing",
    a: { label: "Dot size", def: 0.5 },
    glsl: `
vec3 scene(vec2 p,float t){
  vec3 c=pal(.6+.1*p.y)*.05;
  for(int L=0;L<4;L++){
    float fl=float(L); float depth=1.-fl*.22;
    float sc=3.+fl*2.2;
    vec2 q=p*sc+vec2(t*.012*(fl+1.),t*.006*(fl+1.))+fl*13.+uSeed;
    vec2 id=floor(q); vec2 f=fract(q);
    for(int y=-1;y<=1;y++) for(int x=-1;x<=1;x++){
      vec2 o=vec2(x,y); vec2 h=h22(id+o+fl*5.);
      float present=smoothstep(h.x-.05,h.x+.05,.25+.7*uDensity);
      vec2 pos=o+.5+(h-.5)*.5;
      vec2 wp0=(id+pos-vec2(t*.012*(fl+1.),t*.006*(fl+1.))-fl*13.-uSeed)/sc;
      pos+=wakePush(wp0,.3,.12)*sc*depth;
      float d=length(f-pos);
      float r=(.08+.16*h.y)*(.6+.8*uA)*depth;
      float pulse=.7+.3*sin(uTime*(.15+.25*h.x)+h.y*6.28);
      float glow=0.;
      for(int k=0;k<8;k++){
        if(uTouch[k].z<0.) continue;
        vec2 wp=(id+o+pos-vec2(t*.012*(fl+1.),t*.006*(fl+1.))-fl*13.-uSeed)/sc;
        float xx=uTouch[k].z*.35-length(wp-uTouch[k].xy);
        if(xx>0.) glow+=smoothstep(0.,.08,xx)*exp(-xx*5.);
      }
      float disc=smoothstep(r,r*.55,d);
      c+=present*disc*pal(h.x*.8+.05*fl)*(.45+.4*pulse+.6*glow)*depth;
    }
  }
  return c;
}`,
  },
];

/** the scenes offered to people */
export const VISIBLE_SCENES: SceneDef[] = SCENES.filter((s) => !s.hidden);

export function getScene(id: string): SceneDef {
  return SCENES.find((s) => s.id === id) ?? SCENES[0];
}
