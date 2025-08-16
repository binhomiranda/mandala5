import React, { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { Button } from "./ui/button";
import { Slider } from "./ui/slider";
import { Input } from "./ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Badge } from "./ui/badge";
import { Sparkles, Download, RefreshCw, Bug, Pause, Play, RotateCcw, Upload, Eye, EyeOff, Palette, Settings, Zap, Star } from "lucide-react";

// Fragment shader with kaleidoscope + HSL for image, stars, effects
const frag = `
precision highp float;
uniform vec2 u_res;
uniform float u_time;
uniform float u_sym;
uniform float u_glow;
uniform float u_speed;
uniform float u_scale;
uniform vec2 u_center;
uniform vec3 u_col1;
uniform vec3 u_col2;
uniform vec3 u_col3;
uniform float u_gradMix;
uniform float u_seed;
uniform float u_bgDim;
// stars
uniform float u_stars;
uniform float u_starDensity;
uniform float u_starIntensity;
uniform float u_starSeed;
// effects
uniform float u_effectType;
uniform float u_effectAmp;
uniform float u_effectFreq;
// kaleidoscope image
uniform sampler2D u_tex;
uniform float u_useTex;
uniform float u_texRot;
uniform float u_texScale;
uniform vec2  u_texCenter;
uniform float u_texMix;
uniform float u_texMirror;
// image HSL
uniform float u_imgHue;
uniform float u_imgSat;
uniform float u_imgLight;

#define PI 3.141592653589793

float hash21(vec2 p){
  p = fract(p*vec2(123.34, 345.45));
  p += dot(p, p+34.345);
  return fract(p.x*p.y);
}

float superformula(float phi, float m, float a, float b, float n1, float n2, float n3){
  float t1 = pow(abs(cos(m*phi/4.0)/a), n2);
  float t2 = pow(abs(sin(m*phi/4.0)/b), n3);
  return pow(t1+t2, -1.0/max(0.0001,n1));
}

mat2 rot2(float th){ return mat2(cos(th), -sin(th), sin(th), cos(th)); }

// RGB <-> HSL helpers
vec3 rgb2hsl(vec3 c){
  float r=c.r, g=c.g, b=c.b;
  float maxc = max(max(r,g),b);
  float minc = min(min(r,g),b);
  float h=0.0, s=0.0, l=(maxc+minc)*0.5;
  float d = maxc-minc;
  if (d>1e-5){
    s = l>0.5 ? d/(2.0-maxc-minc) : d/(maxc+minc);
    if (maxc==r) h = (g-b)/d + (g<b?6.0:0.0);
    else if (maxc==g) h = (b-r)/d + 2.0;
    else h = (r-g)/d + 4.0;
    h /= 6.0;
  }
  return vec3(h,s,l);
}

float hue2rgb(float p,float q,float t){
  if(t<0.0) t += 1.0;
  if(t>1.0) t -= 1.0;
  if(t<1.0/6.0) return p + (q-p)*6.0*t;
  if(t<1.0/2.0) return q;
  if(t<2.0/3.0) return p + (q-p)*(2.0/3.0 - t)*6.0;
  return p;
}

vec3 hsl2rgb(vec3 hsl){
  float h=hsl.x, s=hsl.y, l=hsl.z;
  float r,g,b;
  if(s==0.0){ r=g=b=l; }
  else{
    float q = l<0.5? l*(1.0+s) : l + s - l*s;
    float p = 2.0*l - q;
    r = hue2rgb(p,q,h + 1.0/3.0);
    g = hue2rgb(p,q,h);
    b = hue2rgb(p,q,h - 1.0/3.0);
  }
  return vec3(r,g,b);
}

void main(){
  vec2 uv = (gl_FragCoord.xy - 0.5*u_res.xy) / u_res.y;
  uv -= u_center;

  float t = u_time * u_speed;

  // Effects
  vec2 duv = uv;
  float r0 = length(uv);
  if (u_effectType > 0.5 && u_effectType < 1.5) {
    float ripple = sin((r0 * (6.2831 * (1.0 + 4.0*u_effectFreq))) - t*2.0) * (u_effectAmp * 0.12);
    duv *= (1.0 + ripple);
  } else if (u_effectType > 1.5) {
    duv.x += sin(uv.y * (10.0 * (1.0 + 9.0*u_effectFreq)) + t*2.0) * (u_effectAmp * 0.12);
    duv.y += cos(uv.x * (10.0 * (1.0 + 9.0*u_effectFreq)) + t*2.0) * (u_effectAmp * 0.12);
  }

  // Procedural mandala
  float r = length(duv);
  float a = atan(duv.y, duv.x);

  float k = max(1.0, floor(u_sym));
  float wedge = 2.0*PI/k;
  float a_fold = abs(mod(a, wedge) - 0.5*wedge);

  float a_mod = a_fold + 0.25*sin(t*0.33);
  float r_mod = r * u_scale;

  float m = 6.0 + 4.0*sin(t*0.2 + u_seed*6.2831);
  float sf = superformula(a_mod, m, 1.0, 1.0, 0.6+0.4*sin(t*0.11), 8.0, 8.0);

  float bands = sin(10.0*r_mod - sf*6.0 + t) + 0.5*sin(21.0*r_mod + 0.7*t);
  float petals = cos(m*a_mod*0.5 + 2.0*sin(t*0.17));
  float field = bands*petals;

  float fall = exp(-2.0*r_mod*r_mod);
  float gl = smoothstep(0.4, 0.0, abs(field))*fall;
  gl = pow(gl, 0.8) * (0.6 + 0.4*sin(t*0.5 + r_mod*3.0));

  float g = mix(smoothstep(0.0, 1.2, r_mod), clamp(gl, 0.0, 1.0), u_gradMix);
  vec3 col12 = mix(u_col1, u_col2, smoothstep(0.0, 0.6, g));
  vec3 procCol = mix(col12, u_col3, smoothstep(0.35, 1.0, g));

  float aura = smoothstep(1.2, 0.2, r_mod) * 0.35;
  procCol += aura * normalize(u_col3 + 0.2);

  // Kaleidoscope from image
  vec3 imgCol = vec3(0.0);
  if (u_useTex > 0.5) {
    vec2 dir = vec2(cos(a_fold), sin(a_fold));
    vec2 p = dir * r;
    p = rot2(u_texRot) * p;
    p *= u_texScale;
    p -= u_texCenter;
    vec2 tuv = p + 0.5;
    vec2 muv = (u_texMirror > 0.5) ? abs(fract(tuv)*2.0 - 1.0) : fract(tuv);
    imgCol = texture2D(u_tex, muv).rgb;
    
    // HSL adjustments
    vec3 hsl = rgb2hsl(imgCol);
    hsl.x = fract(hsl.x + u_imgHue);
    hsl.y = clamp(hsl.y * u_imgSat, 0.0, 1.0);
    hsl.z = clamp(hsl.z + u_imgLight, 0.0, 1.0);
    imgCol = hsl2rgb(hsl);
  }

  // Stars
  float h = hash21(gl_FragCoord.xy*0.5 + u_starSeed*100.0);
  float stars = step(1.0 - u_starDensity, h) * u_starIntensity * u_stars;

  // Combine
  vec3 col = mix(procCol, imgCol, u_useTex * u_texMix);
  col += stars;
  col *= max(0.0, u_glow);
  col = mix(col, vec3(0.0), u_bgDim);
  col = clamp(col, 0.0, 1.0);
  col = pow(col, vec3(0.4545));
  
  gl_FragColor = vec4(col, 1.0);
}
`;

const vert = `
precision highp float;
varying vec2 vUv;
void main(){
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const MODERN_PALETTES = [
  // Sunset
  ["#ff6b6b", "#ffa726", "#ffcc02"],
  // Ocean
  ["#4fc3f7", "#29b6f6", "#0277bd"],
  // Forest
  ["#66bb6a", "#43a047", "#2e7d32"],
  // Purple Dream
  ["#ba68c8", "#9c27b0", "#7b1fa2"],
  // Cosmic
  ["#e91e63", "#673ab7", "#3f51b5"],
  // Neon
  ["#00e676", "#00bcd4", "#3d5afe"],
  // Warm Earth
  ["#ff8a65", "#ff7043", "#bf360c"],
  // Cool Mint
  ["#4db6ac", "#26a69a", "#00695c"]
];

export default function WebGLMandalaGenerator() {
  const mountRef = useRef(null);
  const rendererRef = useRef(null);
  const sceneRef = useRef(null);
  const cameraRef = useRef(null);
  const meshRef = useRef(null);
  const uniformsRef = useRef(null);

  // Core parameters
  const [sym, setSym] = useState(12);
  const [glow, setGlow] = useState(1.2);
  const [speed, setSpeed] = useState(0.6);
  const [scale, setScale] = useState(1.2);
  const [centerX, setCenterX] = useState(0.0);
  const [centerY, setCenterY] = useState(0.0);
  const [col1, setCol1] = useState("#ff6b6b");
  const [col2, setCol2] = useState("#ffa726");
  const [col3, setCol3] = useState("#ffcc02");
  const [gradMix, setGradMix] = useState(0.7);
  const [seed, setSeed] = useState(() => Math.random());
  const [size, setSize] = useState(1024);
  const [paused, setPaused] = useState(false);
  
  // UI state
  const [activePanel, setActivePanel] = useState('geometry');
  const [diag, setDiag] = useState("Loading...");
  const [exportUrl, setExportUrl] = useState(null);

  // Refs for animation
  const pausedRef = useRef(false);
  const timeRef = useRef(0);
  const lastMsRef = useRef(null);

  // Preview sizing
  const stageRef = useRef(null);
  const [pvW, setPvW] = useState(512);
  const [pvH, setPvH] = useState(512);
  const [aspect, setAspect] = useState('1:1');

  // Text overlay
  const textCanvasRef = useRef(null);
  const [textEnabled, setTextEnabled] = useState(true);
  const [textValue, setTextValue] = useState("Mandala Art");
  const [textSize, setTextSize] = useState(48);
  const [textX, setTextX] = useState(50);
  const [textY, setTextY] = useState(85);
  const [textAlign, setTextAlign] = useState('center');
  const [textColor, setTextColor] = useState("#ffffff");
  const [textBold, setTextBold] = useState(false);
  const [bgDim, setBgDim] = useState(0);

  // Stars
  const [starsOn, setStarsOn] = useState(true);
  const [starDensity, setStarDensity] = useState(0.05);
  const [starIntensity, setStarIntensity] = useState(0.8);
  const [starSeed, setStarSeed] = useState(Math.random());

  // Effects
  const [effectType, setEffectType] = useState(0);
  const [effectAmp, setEffectAmp] = useState(0.3);
  const [effectFreq, setEffectFreq] = useState(0.8);

  // Kaleidoscope
  const [useTex, setUseTex] = useState(false);
  const [texMix, setTexMix] = useState(1.0);
  const [texScale, setTexScale] = useState(1.0);
  const [texRot, setTexRot] = useState(0.0);
  const [texCX, setTexCX] = useState(0.0);
  const [texCY, setTexCY] = useState(0.0);
  const [tex, setTex] = useState(null);
  const [texMirror, setTexMirror] = useState(false);
  const [imgHueDeg, setImgHueDeg] = useState(0);
  const [imgSat, setImgSat] = useState(1.0);
  const [imgLight, setImgLight] = useState(0.0);

  // Color vectors
  const col1Vec = useMemo(() => new THREE.Color(col1), [col1]);
  const col2Vec = useMemo(() => new THREE.Color(col2), [col2]);
  const col3Vec = useMemo(() => new THREE.Color(col3), [col3]);

  // Initialize WebGL
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    try {
      const scene = new THREE.Scene();
      const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
      sceneRef.current = scene;
      cameraRef.current = camera;

      const renderer = new THREE.WebGLRenderer({ 
        antialias: true, 
        preserveDrawingBuffer: true,
        powerPreference: "high-performance"
      });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setSize(size, size, false);
      mount.appendChild(renderer.domElement);
      renderer.domElement.style.width = "100%";
      renderer.domElement.style.height = "100%";
      renderer.domElement.style.display = "block";
      rendererRef.current = renderer;

      const geometry = new THREE.PlaneGeometry(2, 2);
      const uniforms = {
        u_res: { value: new THREE.Vector2(size, size) },
        u_time: { value: 0 },
        u_sym: { value: sym },
        u_glow: { value: glow },
        u_speed: { value: speed },
        u_scale: { value: scale },
        u_center: { value: new THREE.Vector2(centerX, centerY) },
        u_col1: { value: new THREE.Vector3(col1Vec.r, col1Vec.g, col1Vec.b) },
        u_col2: { value: new THREE.Vector3(col2Vec.r, col2Vec.g, col2Vec.b) },
        u_col3: { value: new THREE.Vector3(col3Vec.r, col3Vec.g, col3Vec.b) },
        u_gradMix: { value: gradMix },
        u_seed: { value: seed },
        u_bgDim: { value: bgDim },
        u_stars: { value: starsOn ? 1.0 : 0.0 },
        u_starDensity: { value: starDensity },
        u_starIntensity: { value: starIntensity },
        u_starSeed: { value: starSeed },
        u_effectType: { value: effectType },
        u_effectAmp: { value: effectAmp },
        u_effectFreq: { value: effectFreq },
        u_tex: { value: null },
        u_useTex: { value: useTex ? 1.0 : 0.0 },
        u_texRot: { value: texRot },
        u_texScale: { value: texScale },
        u_texCenter: { value: new THREE.Vector2(texCX, texCY) },
        u_texMix: { value: texMix },
        u_texMirror: { value: texMirror ? 1.0 : 0.0 },
        u_imgHue: { value: 0.0 },
        u_imgSat: { value: imgSat },
        u_imgLight: { value: imgLight },
      };
      uniformsRef.current = uniforms;

      const material = new THREE.ShaderMaterial({
        vertexShader: vert,
        fragmentShader: frag,
        uniforms
      });
      const quad = new THREE.Mesh(geometry, material);
      scene.add(quad);
      meshRef.current = quad;

      renderer.setAnimationLoop((tMS) => {
        if (lastMsRef.current === null) lastMsRef.current = tMS;
        const dt = (tMS - lastMsRef.current) / 1000;
        lastMsRef.current = tMS;
        if (!pausedRef.current) timeRef.current += dt;
        uniforms.u_time.value = timeRef.current;
        renderer.render(scene, camera);
      });

      setDiag("WebGL Ready ✨");
    } catch (error) {
      setDiag(`WebGL Error: ${error.message}`);
      console.error("WebGL initialization failed:", error);
    }

    return () => {
      if (rendererRef.current) {
        rendererRef.current.setAnimationLoop(null);
        if (meshRef.current) {
          meshRef.current.geometry.dispose();
          meshRef.current.material.dispose();
        }
        if (mount.contains(rendererRef.current.domElement)) {
          mount.removeChild(rendererRef.current.domElement);
        }
        rendererRef.current.dispose();
      }
    };
  }, []);

  // Sync uniforms with state
  useEffect(() => {
    const u = uniformsRef.current;
    if (u) u.u_sym.value = sym;
  }, [sym]);

  useEffect(() => {
    const u = uniformsRef.current;
    if (u) u.u_glow.value = glow;
  }, [glow]);

  useEffect(() => {
    const u = uniformsRef.current;
    if (u) u.u_speed.value = speed;
  }, [speed]);

  useEffect(() => {
    const u = uniformsRef.current;
    if (u) u.u_scale.value = scale;
  }, [scale]);

  useEffect(() => {
    const u = uniformsRef.current;
    if (u) u.u_center.value.set(centerX, centerY);
  }, [centerX, centerY]);

  useEffect(() => {
    const u = uniformsRef.current;
    if (u) u.u_col1.value.set(col1Vec.r, col1Vec.g, col1Vec.b);
  }, [col1Vec]);

  useEffect(() => {
    const u = uniformsRef.current;
    if (u) u.u_col2.value.set(col2Vec.r, col2Vec.g, col2Vec.b);
  }, [col2Vec]);

  useEffect(() => {
    const u = uniformsRef.current;
    if (u) u.u_col3.value.set(col3Vec.r, col3Vec.g, col3Vec.b);
  }, [col3Vec]);

  // Responsive preview sizing
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;

    const calc = () => {
      const rect = el.getBoundingClientRect();
      const [aw, ah] = aspect === '1:1' ? [1, 1] : (aspect === '16:9' ? [16, 9] : [9, 16]);
      const w = Math.max(1, Math.round(rect.width));
      const h = Math.max(1, Math.round(w * ah / aw));
      setPvW(w);
      setPvH(h);

      const r = rendererRef.current;
      const u = uniformsRef.current;
      if (r && u) {
        r.setSize(w, h, false);
        u.u_res.value.set(w, h);
        r.render(sceneRef.current, cameraRef.current);
      }

      if (textCanvasRef.current) {
        const c = textCanvasRef.current;
        if (c.width !== w || c.height !== h) {
          c.width = w;
          c.height = h;
        }
      }
      drawTextOverlay();
    };

    const ro = new ResizeObserver(calc);
    ro.observe(el);
    calc();

    return () => ro.disconnect();
  }, [aspect]);

  // Text overlay drawing
  const drawTextOverlay = () => {
    const cvs = textCanvasRef.current;
    if (!cvs) return;

    const ctx = cvs.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, cvs.width, cvs.height);
    
    if (!textEnabled || !textValue.trim()) return;

    ctx.save();
    ctx.textAlign = textAlign;
    ctx.textBaseline = 'middle';
    ctx.fillStyle = textColor;
    const weight = textBold ? '700' : '400';
    ctx.font = `${weight} ${textSize}px system-ui, -apple-system, sans-serif`;
    
    const x = (textX / 100) * cvs.width;
    const y = (textY / 100) * cvs.height;
    
    const lines = textValue.split('\n');
    const lineHeight = textSize * 1.2;
    const totalH = lineHeight * lines.length;
    let yStart = y - totalH / 2 + lineHeight / 2;
    
    for (let i = 0; i < lines.length; i++) {
      ctx.fillText(lines[i], x, yStart + i * lineHeight);
    }
    
    ctx.restore();
  };

  // Export functionality
  const renderToDataURL = (px) => {
    const r = rendererRef.current;
    const u = uniformsRef.current;
    const s = sceneRef.current;
    const c = cameraRef.current;
    
    if (!r || !u || !s || !c) return null;

    const prevPaused = pausedRef.current;
    pausedRef.current = true;
    
    const prevSize = new THREE.Vector2();
    r.getSize(prevSize);
    
    const [aw, ah] = aspect === '1:1' ? [1, 1] : (aspect === '16:9' ? [16, 9] : [9, 16]);
    const expW = Math.max(1, Math.round(px));
    const expH = Math.max(1, Math.round(expW * ah / aw));

    r.setSize(expW, expH, false);
    u.u_res.value.set(expW, expH);
    r.render(s, c);
    
    drawTextOverlay();

    const glCanvas = r.domElement;
    const out = document.createElement('canvas');
    out.width = expW;
    out.height = expH;
    
    const ctx = out.getContext('2d');
    if (!ctx) {
      pausedRef.current = prevPaused;
      return null;
    }
    
    ctx.drawImage(glCanvas, 0, 0);
    
    if (textEnabled && textCanvasRef.current) {
      ctx.drawImage(textCanvasRef.current, 0, 0);
    }

    let url = null;
    try {
      url = out.toDataURL('image/png');
    } catch {
      url = null;
    }

    r.setSize(prevSize.x, prevSize.y, false);
    u.u_res.value.set(prevSize.x, prevSize.y);
    r.render(s, c);
    pausedRef.current = prevPaused;
    drawTextOverlay();
    
    return url;
  };

  const savePNG = () => {
    const url = renderToDataURL(size);
    if (!url) {
      alert('Failed to generate PNG');
      return;
    }
    
    setExportUrl(url);
    
    try {
      const a = document.createElement('a');
      a.href = url;
      a.download = `mandala-${size}px-${Date.now()}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (error) {
      console.log('Auto-download failed, using preview instead');
    }
  };

  const randomize = () => {
    setSeed(Math.random());
    setSym(Math.floor(6 + Math.random() * 24));
    setGlow(0.8 + Math.random() * 2.0);
    setSpeed(0.3 + Math.random() * 1.2);
    setScale(0.8 + Math.random() * 1.8);
    setCenterX((Math.random() - 0.5) * 0.3);
    setCenterY((Math.random() - 0.5) * 0.3);
    
    const palette = MODERN_PALETTES[Math.floor(Math.random() * MODERN_PALETTES.length)];
    setCol1(palette[0]);
    setCol2(palette[1]);
    setCol3(palette[2]);
    
    setGradMix(0.3 + Math.random() * 0.6);
    setStarsOn(Math.random() > 0.3);
    setStarDensity(Math.random() * 0.15 + 0.02);
    setStarIntensity(Math.random() * 0.8 + 0.2);
    setStarSeed(Math.random());
    setEffectType(Math.random() < 0.4 ? 0 : (Math.random() < 0.5 ? 1 : 2));
    setEffectAmp(Math.random() * 0.6 + 0.2);
    setEffectFreq(Math.random());
  };

  const togglePause = () => {
    setPaused(p => {
      pausedRef.current = !p;
      return !p;
    });
  };

  const applyPalette = (palette) => {
    setCol1(palette[0]);
    setCol2(palette[1]);
    setCol3(palette[2]);
  };

  const onUploadImage = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const url = URL.createObjectURL(file);
    const loader = new THREE.TextureLoader();
    
    loader.load(
      url,
      (texture) => {
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.minFilter = THREE.LinearFilter;
        texture.magFilter = THREE.LinearFilter;
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.needsUpdate = true;
        
        setTex(texture);
        setUseTex(true);
        setTexMix(0.8);
        URL.revokeObjectURL(url);
      },
      undefined,
      () => {
        URL.revokeObjectURL(url);
        alert("Failed to load image");
      }
    );
  };

  // Panel components
  const GeometryPanel = () => (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-medium text-slate-300">Symmetry</label>
          <div className="text-xs text-slate-500 mb-2">{sym} segments</div>
          <Slider 
            min={3} max={32} step={1} 
            value={[sym]} 
            onValueChange={([v]) => setSym(v)}
            className="accent-blue-500"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-slate-300">Scale</label>
          <div className="text-xs text-slate-500 mb-2">{scale.toFixed(2)}</div>
          <Slider 
            min={0.5} max={3} step={0.05} 
            value={[scale]} 
            onValueChange={([v]) => setScale(v)}
          />
        </div>
      </div>
      
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-medium text-slate-300">Center X</label>
          <div className="text-xs text-slate-500 mb-2">{centerX.toFixed(2)}</div>
          <Slider 
            min={-0.5} max={0.5} step={0.01} 
            value={[centerX]} 
            onValueChange={([v]) => setCenterX(v)}
          />
        </div>
        <div>
          <label className="text-xs font-medium text-slate-300">Center Y</label>
          <div className="text-xs text-slate-500 mb-2">{centerY.toFixed(2)}</div>
          <Slider 
            min={-0.5} max={0.5} step={0.01} 
            value={[centerY]} 
            onValueChange={([v]) => setCenterY(v)}
          />
        </div>
      </div>

      <div className="flex gap-2">
        <Button 
          size="sm" 
          variant="outline"
          onClick={() => setCenterX(0)}
          className="flex-1 text-xs"
        >
          <RotateCcw className="w-3 h-3 mr-1" />
          Reset X
        </Button>
        <Button 
          size="sm" 
          variant="outline"
          onClick={() => setCenterY(0)}
          className="flex-1 text-xs"
        >
          <RotateCcw className="w-3 h-3 mr-1" />
          Reset Y
        </Button>
      </div>
    </div>
  );

  return (
    <div className="w-full min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-slate-100">
      {/* Modern Header */}
      <header className="sticky top-0 z-50 backdrop-blur-xl bg-slate-950/80 border-b border-slate-800/50">
        <div className="max-w-7xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-gradient-to-r from-blue-500 to-purple-600 rounded-xl">
                <Sparkles className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-semibold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
                  Mandala Lab
                </h1>
                <p className="text-xs text-slate-400">WebGL Generator</p>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-xs">
                <Bug className="w-3 h-3 mr-1" />
                {diag}
              </Badge>
              <Button 
                size="sm" 
                variant="secondary"
                onClick={randomize}
                className="bg-slate-800 hover:bg-slate-700"
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                Random
              </Button>
              <Button 
                size="sm" 
                onClick={togglePause}
                className={paused ? "bg-green-600 hover:bg-green-700" : "bg-orange-600 hover:bg-orange-700"}
              >
                {paused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 py-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Preview Canvas - Takes 2 columns on large screens */}
        <div className="lg:col-span-2">
          <Card className="bg-slate-900/50 border-slate-700/50 backdrop-blur-sm">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium text-slate-300">
                  Live Preview
                </CardTitle>
                <div className="flex items-center gap-2">
                  <div className="flex gap-1">
                    {['1:1', '16:9', '9:16'].map((ratio) => (
                      <Button
                        key={ratio}
                        size="sm"
                        variant={aspect === ratio ? "default" : "outline"}
                        onClick={() => setAspect(ratio)}
                        className="text-xs px-2 py-1"
                      >
                        {ratio}
                      </Button>
                    ))}
                  </div>
                  <Button 
                    size="sm" 
                    onClick={savePNG}
                    className="bg-blue-600 hover:bg-blue-700"
                  >
                    <Download className="w-4 h-4 mr-1" />
                    Export
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pb-4">
              <div 
                ref={stageRef}
                className="relative rounded-lg overflow-hidden bg-black ring-1 ring-slate-700/50 shadow-2xl"
                style={{
                  aspectRatio: aspect === '1:1' ? '1 / 1' : (aspect === '16:9' ? '16 / 9' : '9 / 16'),
                }}
              >
                <div ref={mountRef} className="absolute inset-0" />
                <canvas ref={textCanvasRef} className="absolute inset-0 z-10 pointer-events-none" />
              </div>
              <p className="mt-3 text-xs text-slate-400">
                Export resolution: {size} × {Math.round(size * (aspect === '1:1' ? 1 : (aspect === '16:9' ? 9/16 : 16/9)))}px
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Controls Panel */}
        <div className="space-y-4">
          {/* Panel Tabs */}
          <Card className="bg-slate-900/50 border-slate-700/50 backdrop-blur-sm">
            <CardContent className="p-3">
              <div className="grid grid-cols-2 gap-2 mb-4">
                {[
                  { id: 'geometry', label: 'Geometry', icon: Settings },
                  { id: 'colors', label: 'Colors', icon: Palette },
                  { id: 'effects', label: 'Effects', icon: Zap },
                  { id: 'text', label: 'Text', icon: Star }
                ].map(({ id, label, icon: Icon }) => (
                  <Button
                    key={id}
                    size="sm"
                    variant={activePanel === id ? "default" : "outline"}
                    onClick={() => setActivePanel(id)}
                    className="text-xs"
                  >
                    <Icon className="w-3 h-3 mr-1" />
                    {label}
                  </Button>
                ))}
              </div>

              {/* Panel Content */}
              {activePanel === 'geometry' && <GeometryPanel />}
              
              {activePanel === 'colors' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="text-xs font-medium text-slate-300">Color 1</label>
                      <Input 
                        type="color" 
                        value={col1} 
                        onChange={(e) => setCol1(e.target.value)}
                        className="h-8 p-0 border-0 bg-slate-800 mt-1"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-slate-300">Color 2</label>
                      <Input 
                        type="color" 
                        value={col2} 
                        onChange={(e) => setCol2(e.target.value)}
                        className="h-8 p-0 border-0 bg-slate-800 mt-1"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-slate-300">Color 3</label>
                      <Input 
                        type="color" 
                        value={col3} 
                        onChange={(e) => setCol3(e.target.value)}
                        className="h-8 p-0 border-0 bg-slate-800 mt-1"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-medium text-slate-300">Gradient Mix</label>
                    <div className="text-xs text-slate-500 mb-2">{Math.round(gradMix * 100)}%</div>
                    <Slider 
                      min={0} max={1} step={0.01} 
                      value={[gradMix]} 
                      onValueChange={([v]) => setGradMix(v)}
                    />
                  </div>

                  <div>
                    <label className="text-xs font-medium text-slate-300 mb-2 block">Preset Palettes</label>
                    <div className="grid grid-cols-2 gap-2">
                      {MODERN_PALETTES.map((palette, i) => (
                        <Button
                          key={i}
                          size="sm"
                          variant="outline"
                          onClick={() => applyPalette(palette)}
                          className="h-8 p-0 border-slate-600 hover:border-slate-500"
                          style={{
                            background: `linear-gradient(45deg, ${palette[0]}, ${palette[1]}, ${palette[2]})`
                          }}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {activePanel === 'effects' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-medium text-slate-300">Speed</label>
                      <div className="text-xs text-slate-500 mb-2">{speed.toFixed(2)}</div>
                      <Slider 
                        min={0.1} max={2} step={0.05} 
                        value={[speed]} 
                        onValueChange={([v]) => setSpeed(v)}
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-slate-300">Glow</label>
                      <div className="text-xs text-slate-500 mb-2">{glow.toFixed(2)}</div>
                      <Slider 
                        min={0.2} max={3} step={0.05} 
                        value={[glow]} 
                        onValueChange={([v]) => setGlow(v)}
                      />
                    </div>
                  </div>

                  <div className="space-y-3 p-3 bg-slate-800/30 rounded-lg">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-medium text-slate-300">Stars</label>
                      <Button
                        size="sm"
                        variant={starsOn ? "default" : "outline"}
                        onClick={() => setStarsOn(!starsOn)}
                        className="text-xs"
                      >
                        {starsOn ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                      </Button>
                    </div>
                    {starsOn && (
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-xs text-slate-400">Density</label>
                          <Slider 
                            min={0.01} max={0.2} step={0.01} 
                            value={[starDensity]} 
                            onValueChange={([v]) => setStarDensity(v)}
                            className="mt-1"
                          />
                        </div>
                        <div>
                          <label className="text-xs text-slate-400">Intensity</label>
                          <Slider 
                            min={0.1} max={1} step={0.1} 
                            value={[starIntensity]} 
                            onValueChange={([v]) => setStarIntensity(v)}
                            className="mt-1"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {activePanel === 'text' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-medium text-slate-300">Text Overlay</label>
                    <Button
                      size="sm"
                      variant={textEnabled ? "default" : "outline"}
                      onClick={() => setTextEnabled(!textEnabled)}
                      className="text-xs"
                    >
                      {textEnabled ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                    </Button>
                  </div>

                  {textEnabled && (
                    <>
                      <div>
                        <label className="text-xs font-medium text-slate-300">Content</label>
                        <textarea
                          value={textValue}
                          onChange={(e) => setTextValue(e.target.value)}
                          className="w-full mt-1 p-2 text-sm bg-slate-800 border border-slate-600 rounded-md text-slate-100 resize-none"
                          rows={2}
                          placeholder="Enter your text..."
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-xs text-slate-400">Size</label>
                          <div className="text-xs text-slate-500 mb-1">{textSize}px</div>
                          <Slider 
                            min={12} max={128} step={1} 
                            value={[textSize]} 
                            onValueChange={([v]) => setTextSize(v)}
                          />
                        </div>
                        <div>
                          <label className="text-xs text-slate-400">Color</label>
                          <Input 
                            type="color" 
                            value={textColor} 
                            onChange={(e) => setTextColor(e.target.value)}
                            className="h-8 p-0 border-0 bg-slate-800 mt-1"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-xs text-slate-400">Position X</label>
                          <div className="text-xs text-slate-500 mb-1">{textX}%</div>
                          <Slider 
                            min={0} max={100} step={1} 
                            value={[textX]} 
                            onValueChange={([v]) => setTextX(v)}
                          />
                        </div>
                        <div>
                          <label className="text-xs text-slate-400">Position Y</label>
                          <div className="text-xs text-slate-500 mb-1">{textY}%</div>
                          <Slider 
                            min={0} max={100} step={1} 
                            value={[textY]} 
                            onValueChange={([v]) => setTextY(v)}
                          />
                        </div>
                      </div>
                    </>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Preset Management */}
          <Card className="bg-slate-900/50 border-slate-700/50 backdrop-blur-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-slate-300">Presets</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex gap-2">
                <Button 
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    const preset = {
                      sym, glow, speed, scale, centerX, centerY,
                      col1, col2, col3, gradMix, seed,
                      starsOn, starDensity, starIntensity,
                      effectType, effectAmp, effectFreq
                    };
                    const presetName = prompt("Enter preset name:");
                    if (presetName) {
                      localStorage.setItem(`mandala_preset_${presetName}`, JSON.stringify(preset));
                      alert(`Preset "${presetName}" saved!`);
                    }
                  }}
                  className="flex-1"
                >
                  Save Preset
                </Button>
                <Button 
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    const presets = Object.keys(localStorage).filter(k => k.startsWith('mandala_preset_'));
                    if (presets.length === 0) {
                      alert("No presets found!");
                      return;
                    }
                    const presetList = presets.map(k => k.replace('mandala_preset_', '')).join('\n');
                    const presetName = prompt(`Available presets:\n${presetList}\n\nEnter preset name to load:`);
                    if (presetName) {
                      const preset = localStorage.getItem(`mandala_preset_${presetName}`);
                      if (preset) {
                        const data = JSON.parse(preset);
                        setSym(data.sym); setGlow(data.glow); setSpeed(data.speed);
                        setScale(data.scale); setCenterX(data.centerX); setCenterY(data.centerY);
                        setCol1(data.col1); setCol2(data.col2); setCol3(data.col3);
                        setGradMix(data.gradMix); setSeed(data.seed);
                        setStarsOn(data.starsOn); setStarDensity(data.starDensity);
                        setStarIntensity(data.starIntensity); setEffectType(data.effectType);
                        setEffectAmp(data.effectAmp); setEffectFreq(data.effectFreq);
                        alert(`Preset "${presetName}" loaded!`);
                      } else {
                        alert("Preset not found!");
                      }
                    }
                  }}
                  className="flex-1"
                >
                  Load Preset
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Export Settings */}
          <Card className="bg-slate-900/50 border-slate-700/50 backdrop-blur-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-slate-300">Export Settings</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <label className="text-xs font-medium text-slate-300">Resolution (px)</label>
                <Input
                  type="number"
                  value={size}
                  onChange={(e) => setSize(parseInt(e.target.value) || 1024)}
                  min={256}
                  max={8192}
                  step={256}
                  className="mt-1 bg-slate-800 border-slate-600 text-slate-100"
                />
              </div>
              
              <Button 
                onClick={savePNG}
                className="w-full bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700"
              >
                <Download className="w-4 h-4 mr-2" />
                Download PNG
              </Button>

              {exportUrl && (
                <div className="p-2 bg-slate-800/50 rounded border border-slate-700">
                  <p className="text-xs text-slate-400 mb-2">Preview:</p>
                  <img 
                    src={exportUrl} 
                    alt="Export preview" 
                    className="w-full h-20 object-cover rounded border border-slate-600"
                  />
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}