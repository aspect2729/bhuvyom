/** Exact shaders from design package lib/earth-shader.js — do not edit. */
export const EARTH_VERTEX_SHADER = `#version 300 es
in vec2 p;void main(){gl_Position=vec4(p,0.,1.);}`;

export const EARTH_FRAGMENT_SHADER = `#version 300 es
precision highp float;
uniform vec2 uRes; uniform float uDpr; uniform int uMode; uniform float uTime;
uniform vec2 uC; uniform float uR; uniform float uLon; uniform float uLat;
uniform vec3 uSun; uniform float uFade; uniform vec2 uMark; uniform float uMarkOn;
uniform vec3 uMarkCol; uniform vec3 uAtm; uniform float uCloudRot;
uniform sampler2D tDay; uniform sampler2D tLights; uniform sampler2D tClouds; uniform sampler2D tOcean; uniform sampler2D tBump;
out vec4 o;
const float PI=3.14159265359;
float h21(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
vec2 h22(vec2 p){float n=h21(p);return vec2(n,h21(p+n+1.7));}
vec3 aces(vec3 x){return clamp((x*(2.51*x+0.03))/(x*(2.43*x+0.59)+0.14),0.,1.);}
void main(){
 vec2 fc=vec2(gl_FragCoord.x,uRes.y-gl_FragCoord.y);
 if(uMode==0){
  vec3 col=vec3(0.);
  float cs=58.*uDpr; vec2 cell=floor(fc/cs); float h=h21(cell);
  if(h>0.9){ vec2 sp=(cell+0.15+0.7*h22(cell+7.))*cs; float d=length(fc-sp)/uDpr; float b=(h-0.9)/0.1;
   float tw=0.7+0.3*sin(uTime*(0.5+1.8*h)+h*40.); col+=mix(vec3(0.85,0.88,0.95),vec3(1.,0.9,0.78),h22(cell).x)*b*b*tw*exp(-d*d*1.3)*1.4; }
  vec2 c2=floor(fc/(21.*uDpr)); float h2=h21(c2+31.);
  if(h2>0.975){ vec2 sp=(c2+0.2+0.6*h22(c2+3.))*21.*uDpr; float d=length(fc-sp)/uDpr; col+=vec3(0.8,0.8,0.85)*0.32*exp(-d*d*2.2); }
  o=vec4(col,1.); return;
 }
 vec2 q=(fc-uC)/uR; q.y=-q.y; float r=length(q);
 vec3 n=vec3(q,sqrt(max(0.,1.-r*r)));
 float cp=cos(uLat), sp=sin(uLat);
 vec3 e=normalize(vec3(n.x,n.y*cp+n.z*sp,-n.y*sp+n.z*cp));
 vec3 L=normalize(uSun);
 vec3 Le=vec3(L.x,L.y*cp+L.z*sp,-L.y*sp+L.z*cp);
 vec3 Ve=vec3(0.,sp,cp);
 float lat=asin(clamp(e.y,-1.,1.)); float lon=atan(e.x,e.z)+uLon;
 float u=lon/(2.*PI)+0.5; float v=0.5-lat/PI;
 vec2 uvA=vec2(fract(u),v); vec2 uvB=vec2(fract(u+0.5)-0.5,v);
 vec2 ax=dFdx(uvA), ay=dFdy(uvA), bx=dFdx(uvB), by=dFdy(uvB);
 bool useA=(abs(ax.x)+abs(ay.x))<=(abs(bx.x)+abs(by.x));
 vec2 uv=useA?uvA:uvB; vec2 gx=useA?ax:bx; vec2 gy=useA?ay:by;
 if(r>1.){
  vec2 dq=normalize(q+1e-5); float lit=clamp(dot(dq,normalize(L.xy+1e-4))*0.5+0.5,0.,1.);
  lit=mix(0.06,1.,smoothstep(0.2,0.95,lit));
  float w=(r-1.)*uR; float g=exp(-w/(uR*0.016+3.*uDpr)); float g2=exp(-w/(uR*0.07+10.*uDpr));
  vec3 c=uAtm*(g*0.6+g2*0.10)*lit*uFade;
  o=vec4(c,0.); return;
 }
 vec3 day=textureGrad(tDay,uv,gx,gy).rgb;
 float ocean=textureGrad(tOcean,uv,gx,gy).r;
 float lights=textureGrad(tLights,uv,gx,gy).r;
 vec2 cuv=uv+vec2(uCloudRot,0.);
 float cl=textureGrad(tClouds,cuv,gx,gy).r;
 vec2 tx=vec2(1./4096.,1./2048.);
 float hC=textureGrad(tBump,uv,gx,gy).r; float hE=textureGrad(tBump,uv+vec2(tx.x,0.),gx,gy).r; float hN=textureGrad(tBump,uv-vec2(0.,tx.y),gx,gy).r;
 vec3 east=normalize(vec3(e.z,0.,-e.x)+vec3(1e-5,0.,0.)); vec3 north=cross(e,east);
 vec3 N=normalize(e-(1.-ocean)*5.0*((hE-hC)*east+(hN-hC)*north));
 float eL=dot(e,Le); float NL=max(dot(N,Le),0.);
 float dayK=smoothstep(-0.10,0.20,eL);
 float cs2=textureGrad(tClouds,cuv+vec2(-Le.x,Le.y)*0.0012,gx,gy).r;
 vec3 col=day*(1.-0.5*smoothstep(0.25,0.9,cs2))*NL*2.0;
 vec3 H=normalize(Le+Ve); float NH=max(dot(e,H),0.);
 float spec=(pow(NH,120.)*1.6+pow(NH,18.)*0.10)*ocean*(1.-cl)*dayK;
 col+=vec3(1.,0.94,0.84)*spec;
 float cc=smoothstep(0.06,0.85,cl);
 float cdiff=clamp((eL+0.06)/1.06,0.,1.);
 col=mix(col,vec3(0.98,0.99,1.)*cdiff*1.45,cc*0.93);
 float night=1.-smoothstep(-0.20,0.06,eL);
 col+=vec3(1.,0.66,0.34)*pow(lights,1.3)*2.4*night*(1.-cc*0.85);
 float term=exp(-pow(eL/0.13,2.));
 col*=mix(vec3(1.),vec3(1.18,0.82,0.66),term*0.55*(1.-night*0.7));
 float mu=max(dot(e,Ve),0.);
 float fr=pow(1.-mu,2.4);
 col=mix(col,uAtm*1.25*cdiff,fr*0.6*smoothstep(-0.25,0.45,eL));
 col+=uAtm*pow(1.-mu,7.)*0.45*smoothstep(-0.35,0.5,eL);
 if(uMarkOn>0.){
  float lm=uMark.x; float lo=uMark.y-uLon;
  vec3 Pm=vec3(cos(lm)*sin(lo),sin(lm),cos(lm)*cos(lo));
  float dd=acos(clamp(dot(e,Pm),-1.,1.));
  float t=fract(uTime*0.4);
  float dotm=exp(-pow(dd/0.0048,2.));
  float ring=exp(-pow((dd-t*0.075)/0.0022,2.))*(1.-t);
  float ring2=exp(-pow((dd-0.032)/0.0011,2.))*0.7;
  col+=uMarkCol*(dotm*3.5+ring*1.8+ring2)*uMarkOn;
 }
 col=aces(col*1.08); col=pow(col,vec3(1./2.2));
 float aa=clamp((1.-r)*uR+0.5,0.,1.);
 o=vec4(col*aa*uFade,aa);
}`;
