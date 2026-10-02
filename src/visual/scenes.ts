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
out vec4 outColor;
float asp;
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
    id: "julia", label: "Fractal garden", blurb: "A fractal that slowly reshapes itself",
    a: { label: "Zoom", def: 0.35 },
    glsl: `
vec3 scene(vec2 p,float t){
  float a=t*.02+uSeed; vec2 c=.7885*vec2(cos(a),sin(a));
  vec2 z=p*(2.3-1.3*uA); float it=0.; float m2=0.; float tr=9.;
  float maxIt=20.+44.*uDensity;
  for(int i=0;i<64;i++){
    if(float(i)>=maxIt) break;
    z=vec2(z.x*z.x-z.y*z.y,2.*z.x*z.y)+c; m2=dot(z,z);
    if(m2>64.) break; it+=1.; tr=min(tr,m2);
  }
  if(m2<=64.){ float q=sqrt(tr); return pal(.55+.7*q+t*.004)*(.2+.55*q); }   // inside: shaded by how close the orbit came to the centre
  float v=clamp((it+4.-log2(log2(m2)))/maxIt,0.,1.);
  vec3 col=pal(.15+1.4*sqrt(v)+t*.004);
  return col*(.12+.8*pow(v,.45));
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
      vec2 dv=q-vec2(id+.5+.25*sin(t*.3*(1.+h.x)+h.y*6.),yy*sc);
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
  float n=fbm(p*(.4+1.2*uA)+vec2(t*.03,-t*.02)+uSeed);
  float g=p.y*.35+.5+.5*(n-.5);
  return pal(g*.6+t*.008)*(.5+.3*n)*(.5+.5*uDensity);
}`,
  },
];

export function getScene(id: string): SceneDef {
  return SCENES.find((s) => s.id === id) ?? SCENES[0];
}
