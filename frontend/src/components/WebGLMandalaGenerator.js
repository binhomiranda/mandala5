import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import * as THREE from "three";
import { Button } from "./ui/button";
import { Slider } from "./ui/slider";
import { Input } from "./ui/input";
import { Sparkles, Download, RefreshCw, Pause, Play, RotateCcw, Upload, Eye, EyeOff, Palette, Settings, Zap, Star, Music, Mic, Square, Trash2, Plus, Check, X } from "lucide-react";

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
  ["#ff6b6b", "#ffa726", "#ffcc02"],
  ["#4fc3f7", "#29b6f6", "#0277bd"],
  ["#66bb6a", "#43a047", "#2e7d32"],
  ["#ba68c8", "#9c27b0", "#7b1fa2"],
  ["#e91e63", "#673ab7", "#3f51b5"],
  ["#00e676", "#00bcd4", "#3d5afe"],
  ["#ff8a65", "#ff7043", "#bf360c"],
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

  // Refs for animation
  const pausedRef = useRef(false);
  const timeRef = useRef(0);
  const lastMsRef = useRef(null);

  // Preview sizing
  const stageRef = useRef(null);
  const [aspect, setAspect] = useState('1:1');

  // Text overlay
  const textCanvasRef = useRef(null);
  const [textEnabled, setTextEnabled] = useState(false);
  const [textValue, setTextValue] = useState("Mandala Art");
  const [textSize, setTextSize] = useState(48);
  const [textX, setTextX] = useState(50);
  const [textY, setTextY] = useState(50);
  const [textAlign, setTextAlign] = useState('center');
  const [textColor, setTextColor] = useState("#ffffff");
  const [textBold, setTextBold] = useState(false);
  const [bgDim, setBgDim] = useState(0);

  // Stars
  const [starsOn, setStarsOn] = useState(false);
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

  // Audio analysis
  const [audioEnabled, setAudioEnabled] = useState(false);
  const [audioFile, setAudioFile] = useState(null);
  const [audioContext, setAudioContext] = useState(null);
  const [analyser, setAnalyser] = useState(null);
  const [audioSource, setAudioSource] = useState(null);
  const [audioElement, setAudioElement] = useState(null);
  const [audioIntensity, setAudioIntensity] = useState(1.0);
  const [audioSensitivity, setAudioSensitivity] = useState(0.5);
  const [audioControlMode, setAudioControlMode] = useState('geometry'); // 'geometry', 'kaleidoscope', 'both'
  const [userOverride, setUserOverride] = useState({}); // Track manual user changes
  const audioDataRef = useRef(new Uint8Array(256));
  const overrideTimerRef = useRef({});

  // Audio recording
  const [isRecording, setIsRecording] = useState(false);
  const [recordedAudio, setRecordedAudio] = useState(null);
  const [mediaRecorder, setMediaRecorder] = useState(null);
  const [recordingTime, setRecordingTime] = useState(0);
  const [audioStream, setAudioStream] = useState(null);

  // Presets management
  const [savedPresets, setSavedPresets] = useState([]);
  const [newPresetName, setNewPresetName] = useState("");
  const [showPresetInput, setShowPresetInput] = useState(false);

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
      renderer.setSize(512, 512, false);
      mount.appendChild(renderer.domElement);
      renderer.domElement.style.width = "100%";
      renderer.domElement.style.height = "100%";
      renderer.domElement.style.display = "block";
      rendererRef.current = renderer;

      const geometry = new THREE.PlaneGeometry(2, 2);
      const uniforms = {
        u_res: { value: new THREE.Vector2(512, 512) },
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

  useEffect(() => {
    const u = uniformsRef.current;
    if (u) u.u_gradMix.value = gradMix;
  }, [gradMix]);

  useEffect(() => {
    const u = uniformsRef.current;
    if (u) u.u_seed.value = seed;
  }, [seed]);

  useEffect(() => {
    const u = uniformsRef.current;
    if (u) u.u_bgDim.value = bgDim;
  }, [bgDim]);

  useEffect(() => {
    const u = uniformsRef.current;
    if (u) u.u_stars.value = starsOn ? 1.0 : 0.0;
  }, [starsOn]);

  useEffect(() => {
    const u = uniformsRef.current;
    if (u) u.u_starDensity.value = starDensity;
  }, [starDensity]);

  useEffect(() => {
    const u = uniformsRef.current;
    if (u) u.u_starIntensity.value = starIntensity;
  }, [starIntensity]);

  useEffect(() => {
    const u = uniformsRef.current;
    if (u) u.u_starSeed.value = starSeed;
  }, [starSeed]);

  useEffect(() => {
    const u = uniformsRef.current;
    if (u) u.u_effectType.value = effectType;
  }, [effectType]);

  useEffect(() => {
    const u = uniformsRef.current;
    if (u) u.u_effectAmp.value = effectAmp;
  }, [effectAmp]);

  useEffect(() => {
    const u = uniformsRef.current;
    if (u) u.u_effectFreq.value = effectFreq;
  }, [effectFreq]);

  useEffect(() => {
    const u = uniformsRef.current;
    if (u) u.u_useTex.value = useTex ? 1.0 : 0.0;
  }, [useTex]);

  useEffect(() => {
    const u = uniformsRef.current;
    if (u) u.u_texMix.value = texMix;
  }, [texMix]);

  useEffect(() => {
    const u = uniformsRef.current;
    if (u) u.u_texScale.value = texScale;
  }, [texScale]);

  useEffect(() => {
    const u = uniformsRef.current;
    if (u) u.u_texRot.value = texRot;
  }, [texRot]);

  useEffect(() => {
    const u = uniformsRef.current;
    if (u) u.u_texCenter.value.set(texCX, texCY);
  }, [texCX, texCY]);

  useEffect(() => {
    const u = uniformsRef.current;
    if (u) u.u_texMirror.value = texMirror ? 1.0 : 0.0;
  }, [texMirror]);

  useEffect(() => {
    const u = uniformsRef.current;
    if (u) u.u_imgHue.value = imgHueDeg / 360.0;
  }, [imgHueDeg]);

  useEffect(() => {
    const u = uniformsRef.current;
    if (u) u.u_imgSat.value = imgSat;
  }, [imgSat]);

  useEffect(() => {
    const u = uniformsRef.current;
    if (u) u.u_imgLight.value = imgLight;
  }, [imgLight]);

  useEffect(() => {
    const u = uniformsRef.current;
    if (u && tex) u.u_tex.value = tex;
  }, [tex]);

  // Responsive preview sizing
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;

    const calc = () => {
      const rect = el.getBoundingClientRect();
      const [aw, ah] = aspect === '1:1' ? [1, 1] : (aspect === '16:9' ? [16, 9] : [9, 16]);
      const w = Math.max(1, Math.round(rect.width));
      const h = Math.max(1, Math.round(w * ah / aw));

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

  // Effect to update text overlay when text properties change
  useEffect(() => {
    drawTextOverlay();
  }, [textEnabled, textValue, textSize, textX, textY, textAlign, textColor, textBold]);

  // Clear user overrides when audio is disabled
  useEffect(() => {
    if (!audioEnabled) {
      setUserOverride({});
      Object.keys(overrideTimerRef.current).forEach(key => {
        clearTimeout(overrideTimerRef.current[key]);
      });
      overrideTimerRef.current = {};
    }
  }, [audioEnabled]);

  // User override system - prevents audio from overriding manual changes
  const createManualSetter = useCallback((originalSetter, paramName) => {
    return (value) => {
      // Only create override if audio is actually enabled
      if (audioEnabled) {
        setUserOverride(prev => ({ ...prev, [paramName]: true }));
        
        // Clear override after 3 seconds
        if (overrideTimerRef.current[paramName]) {
          clearTimeout(overrideTimerRef.current[paramName]);
        }
        overrideTimerRef.current[paramName] = setTimeout(() => {
          setUserOverride(prev => ({ ...prev, [paramName]: false }));
        }, 3000);
      }
      
      // Call original setter
      if (Array.isArray(value)) {
        originalSetter(value[0]); // For slider values that come as arrays
      } else {
        originalSetter(value);
      }
    };
  }, [audioEnabled]);

  // Manual setters that override audio control - using useMemo to prevent recreation
  const manualSetGlow = useMemo(() => createManualSetter(setGlow, 'glow'), [createManualSetter]);
  const manualSetSpeed = useMemo(() => createManualSetter(setSpeed, 'speed'), [createManualSetter]);
  const manualSetScale = useMemo(() => createManualSetter(setScale, 'scale'), [createManualSetter]);
  const manualSetTexScale = useMemo(() => createManualSetter(setTexScale, 'texScale'), [createManualSetter]);
  const manualSetTexRot = useMemo(() => createManualSetter(setTexRot, 'texRot'), [createManualSetter]);
  const manualSetTexMix = useMemo(() => createManualSetter(setTexMix, 'texMix'), [createManualSetter]);
  const manualSetTexCX = useMemo(() => createManualSetter(setTexCX, 'texCX'), [createManualSetter]);
  const manualSetTexCY = useMemo(() => createManualSetter(setTexCY, 'texCY'), [createManualSetter]);
  
  // Manual setters for color controls - ALWAYS MANUAL when audio is active
  const manualSetCol1 = useMemo(() => createManualSetter(setCol1, 'col1'), [createManualSetter]);
  const manualSetCol2 = useMemo(() => createManualSetter(setCol2, 'col2'), [createManualSetter]);
  const manualSetCol3 = useMemo(() => createManualSetter(setCol3, 'col3'), [createManualSetter]);

  // Audio processing functions
  const handleAudioUpload = async (event) => {
    const file = event.target.files[0];
    if (file && file.type.startsWith('audio/')) {
      // Check file size (limit to ~10MB for 1 minute of audio)
      if (file.size > 10 * 1024 * 1024) {
        alert("File too large. Please use audio files under 10MB (approximately 1 minute).");
        return;
      }
      
      setAudioFile(file);
      
      // Create audio context and elements
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const audio = new Audio();
      audio.src = URL.createObjectURL(file);
      audio.loop = true;
      
      // Create analyser
      const analyserNode = audioCtx.createAnalyser();
      analyserNode.fftSize = 512;
      const source = audioCtx.createMediaElementSource(audio);
      source.connect(analyserNode);
      analyserNode.connect(audioCtx.destination);
      
      setAudioContext(audioCtx);
      setAnalyser(analyserNode);
      setAudioSource(source);
      setAudioElement(audio);
      
      console.log("Audio loaded successfully!");
    } else {
      alert("Please select a valid audio file.");
    }
  };

  const toggleAudio = () => {
    if (!audioElement) return;
    
    if (audioEnabled) {
      audioElement.pause();
      setAudioEnabled(false);
    } else {
      audioElement.play().then(() => {
        setAudioEnabled(true);
      }).catch(err => {
        console.error("Error playing audio:", err);
        alert("Error playing audio. Try a different file.");
      });
    }
  };

  // Audio analysis effect
  useEffect(() => {
    if (!audioEnabled || !analyser) return;
    
    const updateAudioData = () => {
      if (analyser && audioEnabled) {
        analyser.getByteFrequencyData(audioDataRef.current);
        
        // Calculate average frequency levels for different ranges
        const data = audioDataRef.current;
        const bass = Array.from(data.slice(0, 32)).reduce((a, b) => a + b, 0) / 32;
        const mid = Array.from(data.slice(32, 128)).reduce((a, b) => a + b, 0) / 96;
        const treble = Array.from(data.slice(128, 256)).reduce((a, b) => a + b, 0) / 128;
        
        // Map audio to mandala parameters
        const intensity = audioIntensity * audioSensitivity;
        
        // Adjust mandala based on audio
        const bassNorm = (bass / 255) * intensity;
        const midNorm = (mid / 255) * intensity;
        const trebleNorm = (treble / 255) * intensity;
        
        // Control geometry parameters
        if (audioControlMode === 'geometry' || audioControlMode === 'both') {
          if (!userOverride.glow) setGlow(1.2 + bassNorm * 2.0);
          if (!userOverride.speed) setSpeed(0.6 + midNorm * 1.5);
          if (!userOverride.scale) setScale(1.2 + trebleNorm * 1.0);
          
          // Update effect amplitude based on audio
          setEffectAmp(0.3 + bassNorm * 0.7);
          
          // Subtle color shifts based on frequency - but respect user overrides
          const hueShift = (bassNorm + midNorm + trebleNorm) / 3;
          if (hueShift > 0.3) {
            // Cycle through color palettes based on intensity
            const paletteIndex = Math.floor(hueShift * MODERN_PALETTES.length) % MODERN_PALETTES.length;
            const palette = MODERN_PALETTES[paletteIndex];
            if (Math.random() < 0.1) { // Only change occasionally to avoid flickering
              // Only change colors if user is not manually controlling them
              if (!userOverride.col1 && !userOverride.col2 && !userOverride.col3) {
                setCol1(palette[0]);
                setCol2(palette[1]);
                setCol3(palette[2]);
              }
            }
          }
        }
        
        // Control kaleidoscope parameters
        if ((audioControlMode === 'kaleidoscope' || audioControlMode === 'both') && useTex) {
          // Bass controls image scale
          if (!userOverride.texScale) setTexScale(0.5 + bassNorm * 2.0);
          
          // Mid frequencies control rotation (smoother rotation)
          const currentTime = Date.now() / 1000;
          const rotationSpeed = midNorm * 2.0;
          if (!userOverride.texRot) setTexRot((currentTime * rotationSpeed) % (Math.PI * 2));
          
          // Treble controls mix intensity
          if (!userOverride.texMix) setTexMix(0.3 + trebleNorm * 0.7);
          
          // Combined frequencies create subtle position movement
          const positionIntensity = (bassNorm + midNorm + trebleNorm) / 3;
          if (positionIntensity > 0.2) {
            const moveX = Math.sin(currentTime * 0.5) * positionIntensity * 0.3;
            const moveY = Math.cos(currentTime * 0.7) * positionIntensity * 0.3;
            if (!userOverride.texCX) setTexCX(moveX);
            if (!userOverride.texCY) setTexCY(moveY);
          }
          
          // High intensity can trigger HSL adjustments
          if (positionIntensity > 0.6) {
            setImgHueDeg((currentTime * 30) % 360);
            setImgSat(0.8 + positionIntensity * 0.4);
          }
        }
        
        requestAnimationFrame(updateAudioData);
      }
    };
    
    const animationId = requestAnimationFrame(updateAudioData);
    return () => cancelAnimationFrame(animationId);
  }, [audioEnabled, analyser, audioIntensity, audioSensitivity, audioControlMode, useTex, userOverride]);

  // Load saved presets on component mount
  useEffect(() => {
    const loadPresets = () => {
      const presets = Object.keys(localStorage)
        .filter(k => k.startsWith('mandala_preset_'))
        .map(k => ({
          key: k,
          name: k.replace('mandala_preset_', ''),
          data: JSON.parse(localStorage.getItem(k))
        }));
      setSavedPresets(presets);
    };
    loadPresets();
  }, []);

  // Audio recording functions
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      setAudioStream(stream);
      
      const recorder = new MediaRecorder(stream);
      const chunks = [];
      
      recorder.ondataavailable = (event) => {
        chunks.push(event.data);
      };
      
      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: 'audio/wav' });
        const audioFile = new File([blob], 'recorded_audio.wav', { type: 'audio/wav' });
        setRecordedAudio(audioFile);
        
        // Auto-load the recorded audio
        handleAudioUpload({ target: { files: [audioFile] } });
      };
      
      setMediaRecorder(recorder);
      recorder.start();
      setIsRecording(true);
      setRecordingTime(0);
      
      // Recording timer (max 60 seconds)
      const timer = setInterval(() => {
        setRecordingTime(prev => {
          if (prev >= 60) {
            stopRecording();
            return 60;
          }
          return prev + 1;
        });
      }, 1000);
      
      // Auto-stop after 60 seconds
      setTimeout(() => {
        if (recorder.state === 'recording') {
          stopRecording();
        }
        clearInterval(timer);
      }, 60000);
      
    } catch (error) {
      console.error('Error accessing microphone:', error);
      alert('Could not access microphone. Please check permissions.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorder && mediaRecorder.state === 'recording') {
      mediaRecorder.stop();
    }
    if (audioStream) {
      audioStream.getTracks().forEach(track => track.stop());
    }
    setIsRecording(false);
    setRecordingTime(0);
  };

  const discardRecordedAudio = () => {
    // Stop current audio if playing
    if (audioEnabled) {
      setAudioEnabled(false);
    }
    if (audioElement) {
      audioElement.pause();
      audioElement.src = '';
    }
    
    // Clear recorded audio and related states
    setRecordedAudio(null);
    setAudioFile(null);
    setAudioContext(null);
    setAnalyser(null);
    setAudioSource(null);
    setAudioElement(null);
    
    // CRITICAL: Clear ALL user overrides immediately when audio is disabled
    setUserOverride({});
    Object.keys(overrideTimerRef.current).forEach(key => {
      clearTimeout(overrideTimerRef.current[key]);
    });
    overrideTimerRef.current = {};
    
    console.log("Audio discarded and all overrides cleared");
  };

  // Preset management functions
  const savePreset = () => {
    if (!newPresetName.trim()) return;
    
    const preset = {
      sym, glow, speed, scale, centerX, centerY,
      col1, col2, col3, gradMix, seed,
      starsOn, starDensity, starIntensity,
      effectType, effectAmp, effectFreq,
      textEnabled, textValue, textSize, textX, textY,
      textAlign, textColor, textBold, bgDim,
      useTex, texMix, texScale, texRot, texCX, texCY, texMirror,
      imgHueDeg, imgSat, imgLight,
      aspect, size, audioIntensity, audioSensitivity, audioControlMode
    };
    
    const presetKey = `mandala_preset_${newPresetName.trim()}`;
    localStorage.setItem(presetKey, JSON.stringify(preset));
    
    // Update saved presets list
    const newPreset = {
      key: presetKey,
      name: newPresetName.trim(),
      data: preset
    };
    setSavedPresets(prev => [...prev.filter(p => p.name !== newPresetName.trim()), newPreset]);
    
    setNewPresetName("");
    setShowPresetInput(false);
  };

  const loadPreset = (preset) => {
    try {
      const data = preset.data;
      setSym(data.sym || 12); setGlow(data.glow || 1.2); setSpeed(data.speed || 0.6);
      setScale(data.scale || 1.2); setCenterX(data.centerX || 0); setCenterY(data.centerY || 0);
      setCol1(data.col1 || "#ff6b6b"); setCol2(data.col2 || "#ffa726"); setCol3(data.col3 || "#ffcc02");
      setGradMix(data.gradMix || 0.7); setSeed(data.seed || Math.random());
      setStarsOn(data.starsOn || false); setStarDensity(data.starDensity || 0.05);
      setStarIntensity(data.starIntensity || 0.8); setEffectType(data.effectType || 0);
      setEffectAmp(data.effectAmp || 0.3); setEffectFreq(data.effectFreq || 0.8);
      setTextEnabled(data.textEnabled || false); setTextValue(data.textValue || "Mandala Art");
      setTextSize(data.textSize || 48); setTextX(data.textX || 50); setTextY(data.textY || 50);
      setTextAlign(data.textAlign || 'center'); setTextColor(data.textColor || "#ffffff");
      setTextBold(data.textBold || false); setBgDim(data.bgDim || 0);
      setUseTex(data.useTex || false); setTexMix(data.texMix || 1.0); setTexScale(data.texScale || 1.0);
      setTexRot(data.texRot || 0); setTexCX(data.texCX || 0); setTexCY(data.texCY || 0);
      setTexMirror(data.texMirror || false); setImgHueDeg(data.imgHueDeg || 0);
      setImgSat(data.imgSat || 1.0); setImgLight(data.imgLight || 0);
      setAspect(data.aspect || '1:1'); setSize(data.size || 1024);
      setAudioIntensity(data.audioIntensity || 1.0); setAudioSensitivity(data.audioSensitivity || 0.5);
      setAudioControlMode(data.audioControlMode || 'geometry');
    } catch (error) {
      console.error('Error loading preset:', error);
      alert('Error loading preset');
    }
  };

  const deletePreset = (preset) => {
    localStorage.removeItem(preset.key);
    setSavedPresets(prev => prev.filter(p => p.key !== preset.key));
  };

  // Export functionality
  const savePNG = () => {
    const r = rendererRef.current;
    const u = uniformsRef.current;
    const s = sceneRef.current;
    const c = cameraRef.current;
    
    if (!r || !u || !s || !c) return;

    const prevPaused = pausedRef.current;
    pausedRef.current = true;
    
    const prevSize = new THREE.Vector2();
    r.getSize(prevSize);
    
    const [aw, ah] = aspect === '1:1' ? [1, 1] : (aspect === '16:9' ? [16, 9] : [9, 16]);
    const expW = Math.max(1, Math.round(size));
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
      return;
    }
    
    ctx.drawImage(glCanvas, 0, 0);
    
    if (textEnabled && textCanvasRef.current) {
      ctx.drawImage(textCanvasRef.current, 0, 0);
    }

    try {
      const url = out.toDataURL('image/png');
      const a = document.createElement('a');
      a.href = url;
      a.download = `mandala-${size}px-${Date.now()}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (error) {
      console.log('Export failed:', error);
      alert('Failed to export image');
    }

    r.setSize(prevSize.x, prevSize.y, false);
    u.u_res.value.set(prevSize.x, prevSize.y);
    r.render(s, c);
    pausedRef.current = prevPaused;
    drawTextOverlay();
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

  return (
    <div className="w-full min-h-screen bg-black text-white">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-black/95 backdrop-blur border-b border-zinc-800">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 bg-gradient-to-br from-green-500 to-green-600 rounded-full flex items-center justify-center shadow-lg">
                <Sparkles className="w-5 h-5 text-black" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white">Mandala Lab</h1>
                <p className="text-sm text-zinc-400">Create stunning visual art</p>
              </div>
            </div>
            
            <div className="flex items-center gap-3">
              <div className="px-3 py-1 bg-zinc-900 rounded-full text-xs text-zinc-300">
                {diag}
              </div>
              <Button 
                size="sm" 
                onClick={randomize}
                className="bg-green-500 hover:bg-green-600 text-black font-medium rounded-full px-6"
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                Shuffle
              </Button>
              <Button 
                size="sm" 
                onClick={togglePause}
                className="bg-zinc-800 hover:bg-zinc-700 text-white rounded-full w-10 h-10 p-0"
              >
                {paused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content with Right Sidebar */}
      <div className="max-w-7xl mx-auto px-6 py-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Preview Canvas - Takes 2 columns on large screens */}
        <div className="lg:col-span-2">
          <div className="bg-zinc-950 rounded-xl border border-zinc-800 overflow-hidden">
            {/* Preview Header */}
            <div className="flex items-center justify-between p-4 bg-zinc-900 border-b border-zinc-800">
              <div>
                <h2 className="text-lg font-bold text-white">Live Preview</h2>
                <p className="text-sm text-zinc-400">Real-time mandala generation</p>
              </div>
              
              <div className="flex items-center gap-3">
                <div className="flex gap-1 bg-zinc-800 p-1 rounded-lg">
                  {['1:1', '16:9', '9:16'].map((ratio) => (
                    <Button
                      key={ratio}
                      size="sm"
                      variant="ghost"
                      onClick={() => setAspect(ratio)}
                      className={`px-3 py-1 text-xs font-medium rounded-md ${
                        aspect === ratio 
                          ? 'bg-white text-black' 
                          : 'text-zinc-400 hover:text-white'
                      }`}
                    >
                      {ratio}
                    </Button>
                  ))}
                </div>
                <Button 
                  onClick={savePNG}
                  className="bg-green-500 hover:bg-green-600 text-black font-medium rounded-lg px-4"
                >
                  <Download className="w-4 h-4 mr-2" />
                  Export
                </Button>
              </div>
            </div>

            {/* Canvas */}
            <div className="p-4 bg-black">
              <div 
                ref={stageRef}
                className="w-full relative rounded-lg overflow-hidden bg-black shadow-2xl"
                style={{
                  aspectRatio: aspect === '1:1' ? '1 / 1' : (aspect === '16:9' ? '16 / 9' : '9 / 16'),
                }}
              >
                <div ref={mountRef} className="absolute inset-0" />
                <canvas ref={textCanvasRef} className="absolute inset-0 z-10 pointer-events-none" />
                
                {/* Status Panel - Small overlay showing active features */}
                <div className="absolute top-2 left-2 bg-black/50 backdrop-blur-sm rounded-lg p-2 z-20 text-xs text-white/80 space-y-1">
                  <div className="font-medium text-white/90 mb-1">Active</div>
                  {audioEnabled && (
                    <div className="flex items-center gap-1">
                      <div className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse"></div>
                      <span>Audio Reactive</span>
                    </div>
                  )}
                  {textEnabled && (
                    <div className="flex items-center gap-1">
                      <div className="w-1.5 h-1.5 bg-blue-400 rounded-full"></div>
                      <span>Text</span>
                    </div>
                  )}
                  {starsOn && (
                    <div className="flex items-center gap-1">
                      <div className="w-1.5 h-1.5 bg-yellow-400 rounded-full"></div>
                      <span>Stars</span>
                    </div>
                  )}
                  {useTex && (
                    <div className="flex items-center gap-1">
                      <div className="w-1.5 h-1.5 bg-purple-400 rounded-full"></div>
                      <span>Image</span>
                    </div>
                  )}
                  {effectType > 0 && (
                    <div className="flex items-center gap-1">
                      <div className="w-1.5 h-1.5 bg-orange-400 rounded-full"></div>
                      <span>{effectType === 1 ? 'Ripple' : 'Wave'}</span>
                    </div>
                  )}
                  {bgDim > 0 && (
                    <div className="flex items-center gap-1">
                      <div className="w-1.5 h-1.5 bg-red-400 rounded-full"></div>
                      <span>Dim BG</span>
                    </div>
                  )}
                  {(!audioEnabled && !textEnabled && !starsOn && !useTex && effectType === 0 && bgDim === 0) && (
                    <div className="text-white/60">None</div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Sidebar - Controls */}
        <div className="bg-zinc-900 rounded-xl border border-zinc-800 overflow-hidden">
          <div className="p-4 h-full overflow-y-auto">
            {/* Tab Navigation */}
            <div className="space-y-2 mb-6">
              {[
                { id: 'geometry', label: 'Geometry', icon: Settings },
                { id: 'colors', label: 'Colors', icon: Palette },
                { id: 'kaleidoscope', label: 'Kaleidoscope', icon: Upload },
                { id: 'effects', label: 'Effects', icon: Zap },
                { id: 'audio', label: 'Audio', icon: Music },
                { id: 'text', label: 'Text', icon: Star }
              ].map(({ id, label, icon: Icon }) => (
                <Button
                  key={id}
                  variant="ghost"
                  onClick={() => setActivePanel(id)}
                  className={`w-full justify-start text-sm font-medium rounded-md transition-colors ${
                    activePanel === id 
                      ? 'bg-zinc-800 text-white' 
                      : 'text-zinc-400 hover:text-white hover:bg-zinc-800/50'
                  }`}
                >
                  <Icon className="w-4 h-4 mr-3" />
                  {label}
                </Button>
              ))}
            </div>

            {/* Panel Content */}
            <div className="border-t border-zinc-800 pt-6">
              {activePanel === 'geometry' && (
                <div className="space-y-6">
                  <h3 className="text-lg font-semibold text-white mb-4">Geometry</h3>
                  
                  <div className="space-y-4">
                    <div className="p-4 bg-zinc-800 rounded-lg">
                      <label className="text-sm font-medium text-zinc-300 block mb-2">Symmetry</label>
                      <div className="text-xs text-zinc-400 mb-2">{sym} segments</div>
                      <Slider 
                        min={3} max={32} step={1} 
                        value={[sym]} 
                        onValueChange={([v]) => setSym(v)}
                        className="w-full"
                      />
                    </div>
                    
                    <div className="p-4 bg-zinc-800 rounded-lg">
                      <label className="text-sm font-medium text-zinc-300 block mb-2">Scale</label>
                      <div className="text-xs text-zinc-400 mb-2">{scale.toFixed(2)}×</div>
                      <Slider 
                        min={0.5} max={3} step={0.05} 
                        value={[scale]} 
                        onValueChange={manualSetScale}
                        className="w-full"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="p-4 bg-zinc-800 rounded-lg">
                        <label className="text-sm font-medium text-zinc-300 block mb-2">Center X</label>
                        <div className="text-xs text-zinc-400 mb-2">{centerX.toFixed(2)}</div>
                        <Slider 
                          min={-0.5} max={0.5} step={0.01} 
                          value={[centerX]} 
                          onValueChange={([v]) => setCenterX(v)}
                          className="w-full"
                        />
                      </div>
                      <div className="p-4 bg-zinc-800 rounded-lg">
                        <label className="text-sm font-medium text-zinc-300 block mb-2">Center Y</label>
                        <div className="text-xs text-zinc-400 mb-2">{centerY.toFixed(2)}</div>
                        <Slider 
                          min={-0.5} max={0.5} step={0.01} 
                          value={[centerY]} 
                          onValueChange={([v]) => setCenterY(v)}
                          className="w-full"
                        />
                      </div>
                    </div>

                    <div className="flex gap-2">
                      <Button 
                        size="sm" 
                        variant="outline"
                        onClick={() => setCenterX(0)}
                        className="flex-1 bg-zinc-700 hover:bg-zinc-600 border-zinc-600 text-zinc-300"
                      >
                        <RotateCcw className="w-3 h-3 mr-2" />
                        Reset X
                      </Button>
                      <Button 
                        size="sm" 
                        variant="outline"
                        onClick={() => setCenterY(0)}
                        className="flex-1 bg-zinc-700 hover:bg-zinc-600 border-zinc-600 text-zinc-300"
                      >
                        <RotateCcw className="w-3 h-3 mr-2" />
                        Reset Y
                      </Button>
                    </div>
                  </div>
                </div>
              )}
              
              {activePanel === 'colors' && (
                <div className="space-y-6">
                  <h3 className="text-lg font-semibold text-white mb-4">Colors</h3>
                  
                  <div className="space-y-4">
                    <div className="grid grid-cols-3 gap-3">
                      <div className="p-3 bg-zinc-800 rounded-lg">
                        <label className="text-sm font-medium text-zinc-300 block mb-2">Color 1</label>
                        <Input 
                          type="color" 
                          value={col1} 
                          onChange={(e) => manualSetCol1(e.target.value)}
                          className="h-10 p-1 border-0 bg-zinc-700 rounded-lg"
                        />
                      </div>
                      <div className="p-3 bg-zinc-800 rounded-lg">
                        <label className="text-sm font-medium text-zinc-300 block mb-2">Color 2</label>
                        <Input 
                          type="color" 
                          value={col2} 
                          onChange={(e) => setCol2(e.target.value)}
                          className="h-10 p-1 border-0 bg-zinc-700 rounded-lg"
                        />
                      </div>
                      <div className="p-3 bg-zinc-800 rounded-lg">
                        <label className="text-sm font-medium text-zinc-300 block mb-2">Color 3</label>
                        <Input 
                          type="color" 
                          value={col3} 
                          onChange={(e) => setCol3(e.target.value)}
                          className="h-10 p-1 border-0 bg-zinc-700 rounded-lg"
                        />
                      </div>
                    </div>

                    <div className="p-4 bg-zinc-800 rounded-lg">
                      <label className="text-sm font-medium text-zinc-300 block mb-2">Gradient Mix</label>
                      <div className="text-xs text-zinc-400 mb-2">{Math.round(gradMix * 100)}%</div>
                      <Slider 
                        min={0} max={1} step={0.01} 
                        value={[gradMix]} 
                        onValueChange={([v]) => setGradMix(v)}
                        className="w-full"
                      />
                    </div>

                    <div className="p-4 bg-zinc-800 rounded-lg">
                      <label className="text-sm font-medium text-zinc-300 block mb-3">Color Presets</label>
                      <div className="grid grid-cols-2 gap-2">
                        {MODERN_PALETTES.map((palette, i) => (
                          <Button
                            key={i}
                            size="sm"
                            variant="outline"
                            onClick={() => applyPalette(palette)}
                            className="h-10 p-0 border-zinc-600 hover:border-zinc-500 rounded-lg overflow-hidden"
                            style={{
                              background: `linear-gradient(135deg, ${palette[0]}, ${palette[1]}, ${palette[2]})`
                            }}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {activePanel === 'kaleidoscope' && (
                <div className="space-y-6">
                  <h3 className="text-lg font-semibold text-white mb-4">Kaleidoscope</h3>
                  
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <label className="text-sm font-medium text-zinc-300">Image Upload</label>
                      <Button
                        size="sm"
                        variant={useTex ? "default" : "outline"}
                        onClick={() => setUseTex(!useTex)}
                        className={useTex ? "bg-green-500 text-black hover:bg-green-600" : "bg-zinc-800 hover:bg-zinc-700 border-zinc-700"}
                      >
                        {useTex ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                      </Button>
                    </div>

                    <Input
                      type="file"
                      accept="image/*"
                      onChange={onUploadImage}
                      className="bg-zinc-800 border-zinc-700 text-zinc-300"
                    />

                    {useTex && (
                      <div className="space-y-4 p-4 bg-zinc-800 rounded-lg">
                        <div>
                          <label className="text-sm font-medium text-zinc-300 block mb-2">Image Mix</label>
                          <div className="text-xs text-zinc-500 mb-2">{Math.round(texMix * 100)}%</div>
                          <Slider 
                            min={0} max={1} step={0.01} 
                            value={[texMix]} 
                            onValueChange={manualSetTexMix}
                            className="w-full"
                          />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="text-sm font-medium text-zinc-300 block mb-2">Scale</label>
                            <div className="text-xs text-zinc-500 mb-2">{texScale.toFixed(2)}×</div>
                            <Slider 
                              min={0.1} max={5} step={0.01} 
                              value={[texScale]} 
                              onValueChange={manualSetTexScale}
                              className="w-full"
                            />
                          </div>
                          <div>
                            <label className="text-sm font-medium text-zinc-300 block mb-2">Rotation</label>
                            <div className="text-xs text-zinc-500 mb-2">{Math.round(texRot * 180/Math.PI)}°</div>
                            <Slider 
                              min={0} max={Math.PI * 2} step={0.01} 
                              value={[texRot]} 
                              onValueChange={manualSetTexRot}
                              className="w-full"
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="text-sm font-medium text-zinc-300 block mb-2">Offset X</label>
                            <div className="text-xs text-zinc-500 mb-2">{texCX.toFixed(2)}</div>
                            <Slider 
                              min={-1} max={1} step={0.01} 
                              value={[texCX]} 
                              onValueChange={manualSetTexCX}
                              className="w-full"
                            />
                          </div>
                          <div>
                            <label className="text-sm font-medium text-zinc-300 block mb-2">Offset Y</label>
                            <div className="text-xs text-zinc-500 mb-2">{texCY.toFixed(2)}</div>
                            <Slider 
                              min={-1} max={1} step={0.01} 
                              value={[texCY]} 
                              onValueChange={manualSetTexCY}
                              className="w-full"
                            />
                          </div>
                        </div>

                        <div className="flex items-center justify-between p-3 bg-zinc-700 rounded-lg">
                          <label className="text-sm font-medium text-zinc-300">Mirror Edges</label>
                          <Button
                            size="sm"
                            variant={texMirror ? "default" : "outline"}
                            onClick={() => setTexMirror(!texMirror)}
                            className={texMirror ? "bg-green-500 text-black hover:bg-green-600" : "bg-zinc-600 hover:bg-zinc-500 border-zinc-500 text-zinc-300"}
                          >
                            {texMirror ? "ON" : "OFF"}
                          </Button>
                        </div>

                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setTexMix(1.0);
                            setTexScale(1.0);
                            setTexRot(0);
                            setTexCX(0);
                            setTexCY(0);
                            setTexMirror(false);
                            setImgHueDeg(0);
                            setImgSat(1.0);
                            setImgLight(0.0);
                          }}
                          className="w-full bg-zinc-700 hover:bg-zinc-600 border-zinc-600 text-zinc-300"
                        >
                          <RotateCcw className="w-3 h-3 mr-2" />
                          Reset All Settings
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {activePanel === 'effects' && (
                <div className="space-y-6">
                  <h3 className="text-lg font-semibold text-white mb-4">Effects</h3>
                  
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="p-4 bg-zinc-800 rounded-lg">
                        <label className="text-sm font-medium text-zinc-300 block mb-2">Speed</label>
                        <div className="text-xs text-zinc-400 mb-2">{speed.toFixed(2)}×</div>
                        <Slider 
                          min={0.1} max={2} step={0.05} 
                          value={[speed]} 
                          onValueChange={manualSetSpeed}
                          className="w-full"
                        />
                      </div>
                      <div className="p-4 bg-zinc-800 rounded-lg">
                        <label className="text-sm font-medium text-zinc-300 block mb-2">Glow</label>
                        <div className="text-xs text-zinc-400 mb-2">{glow.toFixed(2)}×</div>
                        <Slider 
                          min={0.2} max={3} step={0.05} 
                          value={[glow]} 
                          onValueChange={manualSetGlow}
                          className="w-full"
                        />
                      </div>
                    </div>

                    <div className="space-y-3 p-4 bg-zinc-800 rounded-lg">
                      <div className="flex items-center justify-between">
                        <label className="text-sm font-medium text-zinc-300">Stars</label>
                        <Button
                          size="sm"
                          variant={starsOn ? "default" : "outline"}
                          onClick={() => setStarsOn(!starsOn)}
                          className={starsOn ? "bg-green-500 text-black hover:bg-green-600" : "bg-zinc-700 hover:bg-zinc-600 border-zinc-600"}
                        >
                          {starsOn ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                        </Button>
                      </div>
                      {starsOn && (
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="text-xs text-zinc-400 block mb-1">Density</label>
                            <div className="text-xs text-zinc-500 mb-1">{(starDensity * 100).toFixed(1)}%</div>
                            <Slider 
                              min={0.01} max={0.2} step={0.01} 
                              value={[starDensity]} 
                              onValueChange={([v]) => setStarDensity(v)}
                              className="w-full"
                            />
                          </div>
                          <div>
                            <label className="text-xs text-zinc-400 block mb-1">Intensity</label>
                            <div className="text-xs text-zinc-500 mb-1">{(starIntensity * 100).toFixed(0)}%</div>
                            <Slider 
                              min={0.1} max={1} step={0.1} 
                              value={[starIntensity]} 
                              onValueChange={([v]) => setStarIntensity(v)}
                              className="w-full"
                            />
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="space-y-3 p-4 bg-zinc-800 rounded-lg">
                      <label className="text-sm font-medium text-zinc-300 block mb-3">Wave Effects</label>
                      <div className="flex gap-2">
                        {[
                          { value: 0, label: 'None' },
                          { value: 1, label: 'Ripple' },
                          { value: 2, label: 'Wave' }
                        ].map((effect) => (
                          <Button
                            key={effect.value}
                            size="sm"
                            variant={effectType === effect.value ? "default" : "outline"}
                            onClick={() => setEffectType(effect.value)}
                            className={`flex-1 text-xs ${
                              effectType === effect.value 
                                ? "bg-green-500 text-black hover:bg-green-600" 
                                : "bg-zinc-700 hover:bg-zinc-600 border-zinc-600 text-zinc-300"
                            }`}
                          >
                            {effect.label}
                          </Button>
                        ))}
                      </div>
                      {effectType > 0 && (
                        <div className="grid grid-cols-2 gap-3 mt-3">
                          <div>
                            <label className="text-xs text-zinc-400 block mb-1">Amplitude</label>
                            <div className="text-xs text-zinc-500 mb-1">{(effectAmp * 100).toFixed(0)}%</div>
                            <Slider 
                              min={0} max={1} step={0.01} 
                              value={[effectAmp]} 
                              onValueChange={([v]) => setEffectAmp(v)}
                              className="w-full"
                            />
                          </div>
                          <div>
                            <label className="text-xs text-zinc-400 block mb-1">Frequency</label>
                            <div className="text-xs text-zinc-500 mb-1">{effectFreq.toFixed(2)}</div>
                            <Slider 
                              min={0} max={2} step={0.01} 
                              value={[effectFreq]} 
                              onValueChange={([v]) => setEffectFreq(v)}
                              className="w-full"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {activePanel === 'text' && (
                <div className="space-y-6">
                  <h3 className="text-lg font-semibold text-white mb-4">Text Overlay</h3>
                  
                  <div className="space-y-4">
                    <div className="flex items-center justify-between p-4 bg-zinc-800 rounded-lg">
                      <label className="text-sm font-medium text-zinc-300">Enable Text</label>
                      <Button
                        size="sm"
                        variant={textEnabled ? "default" : "outline"}
                        onClick={() => setTextEnabled(!textEnabled)}
                        className={textEnabled ? "bg-green-500 text-black hover:bg-green-600" : "bg-zinc-700 hover:bg-zinc-600 border-zinc-600"}
                      >
                        {textEnabled ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                      </Button>
                    </div>

                    {textEnabled && (
                      <div className="space-y-4">
                        <div className="p-4 bg-zinc-800 rounded-lg">
                          <label className="text-sm font-medium text-zinc-300 block mb-2">Content</label>
                          <textarea
                            value={textValue}
                            onChange={(e) => setTextValue(e.target.value)}
                            className="w-full p-3 bg-zinc-700 border border-zinc-600 rounded-lg text-zinc-100 resize-none"
                            rows={3}
                            placeholder="Enter your text..."
                          />
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <div className="p-4 bg-zinc-800 rounded-lg">
                            <label className="text-sm font-medium text-zinc-300 block mb-2">Size</label>
                            <div className="text-xs text-zinc-400 mb-2">{textSize}px</div>
                            <Slider 
                              min={12} max={128} step={1} 
                              value={[textSize]} 
                              onValueChange={([v]) => setTextSize(v)}
                              className="w-full"
                            />
                          </div>
                          <div className="p-4 bg-zinc-800 rounded-lg">
                            <label className="text-sm font-medium text-zinc-300 block mb-2">Color</label>
                            <Input 
                              type="color" 
                              value={textColor} 
                              onChange={(e) => setTextColor(e.target.value)}
                              className="h-10 p-1 border-0 bg-zinc-700 rounded-lg"
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <div className="p-4 bg-zinc-800 rounded-lg">
                            <label className="text-sm font-medium text-zinc-300 block mb-2">Position X</label>
                            <div className="text-xs text-zinc-400 mb-2">{textX}%</div>
                            <Slider 
                              min={0} max={100} step={1} 
                              value={[textX]} 
                              onValueChange={([v]) => setTextX(v)}
                              className="w-full"
                            />
                          </div>
                          <div className="p-4 bg-zinc-800 rounded-lg">
                            <label className="text-sm font-medium text-zinc-300 block mb-2">Position Y</label>
                            <div className="text-xs text-zinc-400 mb-2">{textY}%</div>
                            <Slider 
                              min={0} max={100} step={1} 
                              value={[textY]} 
                              onValueChange={([v]) => setTextY(v)}
                              className="w-full"
                            />
                          </div>
                        </div>

                        <div className="p-4 bg-zinc-800 rounded-lg">
                          <label className="text-sm font-medium text-zinc-300 block mb-2">Background Dimmer</label>
                          <div className="text-xs text-zinc-400 mb-2">Darken background behind text: {Math.round(bgDim * 100)}%</div>
                          <Slider 
                            min={0} max={0.8} step={0.01} 
                            value={[bgDim]} 
                            onValueChange={([v]) => setBgDim(v)}
                            className="w-full"
                          />
                        </div>

                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setTextX(50);
                              setTextY(50);
                              setBgDim(0);
                            }}
                            className="flex-1 bg-zinc-700 hover:bg-zinc-600 border-zinc-600 text-zinc-300"
                          >
                            <RotateCcw className="w-3 h-3 mr-2" />
                            Reset Position
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setTextBold(!textBold)}
                            className={`flex-1 ${textBold ? 'bg-green-500 text-black hover:bg-green-600' : 'bg-zinc-700 hover:bg-zinc-600 border-zinc-600 text-zinc-300'}`}
                          >
                            {textBold ? 'Bold ON' : 'Bold OFF'}
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {activePanel === 'audio' && (
                <div className="space-y-6">
                  <h3 className="text-lg font-semibold text-white mb-4">Audio-Reactive Mandalas</h3>
                  <p className="text-sm text-zinc-400 mb-4">Upload or record audio (up to 1 minute) to generate reactive mandalas based on music frequencies</p>
                  
                  <div className="space-y-4">
                    {/* Audio Upload */}
                    <div className="p-4 bg-zinc-800 rounded-lg">
                      <label className="text-sm font-medium text-zinc-300 block mb-3">Upload Audio File</label>
                      <input
                        type="file"
                        accept="audio/*"
                        onChange={handleAudioUpload}
                        className="w-full p-2 bg-zinc-700 border border-zinc-600 rounded-lg text-zinc-300 text-sm file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:bg-green-500 file:text-black hover:file:bg-green-600"
                      />
                      {audioFile && !recordedAudio && (
                        <div className="mt-2 text-xs text-green-400">
                          ✓ {audioFile.name} loaded
                        </div>
                      )}
                    </div>

                    {/* Audio Recording */}
                    <div className="p-4 bg-zinc-800 rounded-lg">
                      <label className="text-sm font-medium text-zinc-300 block mb-3">Record Your Own Audio</label>
                      <div className="flex items-center gap-3">
                        <Button
                          size="sm"
                          onClick={isRecording ? stopRecording : startRecording}
                          className={isRecording ? "bg-red-500 text-white hover:bg-red-600" : "bg-green-500 text-black hover:bg-green-600"}
                        >
                          {isRecording ? (
                            <>
                              <Square className="w-3 h-3 mr-2" />
                              Stop ({60 - recordingTime}s)
                            </>
                          ) : (
                            <>
                              <Mic className="w-3 h-3 mr-2" />
                              Record
                            </>
                          )}
                        </Button>
                        {isRecording && (
                          <div className="flex items-center gap-2">
                            <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></div>
                            <span className="text-xs text-zinc-400">Recording... {recordingTime}s</span>
                          </div>
                        )}
                        {recordedAudio && !isRecording && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={discardRecordedAudio}
                            className="border-red-500 text-red-500 hover:bg-red-500 hover:text-white"
                          >
                            <Trash2 className="w-3 h-3 mr-2" />
                            Discard
                          </Button>
                        )}
                      </div>
                      {recordedAudio && (
                        <div className="mt-2 flex items-center justify-between">
                          <span className="text-xs text-green-400">
                            ✓ Audio recorded successfully - {recordedAudio.name}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Audio Control Mode - Always visible */}
                    <div className="p-4 bg-zinc-800 rounded-lg">
                      <label className="text-sm font-medium text-zinc-300 block mb-3">Audio Control Mode</label>
                      <div className="grid grid-cols-3 gap-2">
                        <Button
                          size="sm"
                          onClick={() => setAudioControlMode('geometry')}
                          className={audioControlMode === 'geometry' 
                            ? "bg-blue-500 text-white hover:bg-blue-600" 
                            : "bg-zinc-700 hover:bg-zinc-600 text-zinc-300"}
                        >
                          Geometry
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => setAudioControlMode('kaleidoscope')}
                          disabled={!useTex}
                          className={audioControlMode === 'kaleidoscope' 
                            ? "bg-purple-500 text-white hover:bg-purple-600" 
                            : "bg-zinc-700 hover:bg-zinc-600 text-zinc-300 disabled:bg-zinc-800 disabled:text-zinc-500"}
                        >
                          Kaleidoscope
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => setAudioControlMode('both')}
                          className={audioControlMode === 'both' 
                            ? "bg-green-500 text-black hover:bg-green-600" 
                            : "bg-zinc-700 hover:bg-zinc-600 text-zinc-300"}
                        >
                          Both
                        </Button>
                      </div>
                      <div className="mt-2 text-xs text-zinc-400">
                        {audioControlMode === 'geometry' && "Controls: Glow, Speed, Scale, Colors, Effects"}
                        {audioControlMode === 'kaleidoscope' && useTex && "Controls: Image Scale, Rotation, Mix, Position, HSL"}
                        {audioControlMode === 'kaleidoscope' && !useTex && "Upload an image in Kaleidoscope tab to enable"}
                        {audioControlMode === 'both' && "Controls: All geometry + kaleidoscope parameters"}
                      </div>
                    </div>

                    {/* Audio Controls - Only when file loaded */}
                    {(audioFile || recordedAudio) && (
                      <div className="space-y-4">
                        <div className="flex items-center justify-between p-4 bg-zinc-800 rounded-lg">
                          <label className="text-sm font-medium text-zinc-300">Audio Reactive Mode</label>
                          <Button
                            size="sm"
                            onClick={toggleAudio}
                            className={audioEnabled ? "bg-green-500 text-black hover:bg-green-600" : "bg-zinc-700 hover:bg-zinc-600 border-zinc-600"}
                          >
                            {audioEnabled ? <Pause className="w-3 h-3 mr-2" /> : <Play className="w-3 h-3 mr-2" />}
                            {audioEnabled ? 'Playing' : 'Play'}
                          </Button>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <div className="p-4 bg-zinc-800 rounded-lg">
                            <label className="text-sm font-medium text-zinc-300 block mb-2">Intensity</label>
                            <div className="text-xs text-zinc-400 mb-2">{(audioIntensity * 100).toFixed(0)}%</div>
                            <Slider 
                              min={0.1} max={2.0} step={0.1} 
                              value={[audioIntensity]} 
                              onValueChange={([v]) => setAudioIntensity(v)}
                              className="w-full"
                            />
                          </div>
                          <div className="p-4 bg-zinc-800 rounded-lg">
                            <label className="text-sm font-medium text-zinc-300 block mb-2">Sensitivity</label>
                            <div className="text-xs text-zinc-400 mb-2">{(audioSensitivity * 100).toFixed(0)}%</div>
                            <Slider 
                              min={0.1} max={1.0} step={0.1} 
                              value={[audioSensitivity]} 
                              onValueChange={([v]) => setAudioSensitivity(v)}
                              className="w-full"
                            />
                          </div>
                        </div>

                        <div className="p-3 bg-zinc-700 rounded-lg">
                          <p className="text-xs text-zinc-400">
                            <strong className="text-white">How it works:</strong><br/>
                            {audioControlMode === 'geometry' && (
                              <>
                                • Bass frequencies → Glow intensity<br/>
                                • Mid frequencies → Animation speed<br/>
                                • Treble frequencies → Scale<br/>
                                • High intensity → Color changes & effects<br/>
                                <span className="text-yellow-400">💡 Tip: Manual adjustments pause audio control for 3 seconds</span>
                              </>
                            )}
                            {audioControlMode === 'kaleidoscope' && (
                              <>
                                • Bass frequencies → Image scale<br/>
                                • Mid frequencies → Image rotation<br/>
                                • Treble frequencies → Mix intensity<br/>
                                • Combined → Position movement & HSL shifts<br/>
                                <span className="text-yellow-400">💡 Tip: Manual adjustments pause audio control for 3 seconds</span>
                              </>
                            )}
                            {audioControlMode === 'both' && (
                              <>
                                • Bass → Glow intensity + Image scale<br/>
                                • Mid → Animation speed + Image rotation<br/>
                                • Treble → Mandala scale + Mix intensity<br/>
                                • High intensity → Colors + Position + HSL<br/>
                                <span className="text-yellow-400">💡 Tip: Manual adjustments pause audio control for 3 seconds</span>
                              </>
                            )}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Bottom Section - Presets and Export */}
            <div className="border-t border-zinc-800 pt-6 mt-6 space-y-6">
              {/* Preset Management */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-sm font-semibold text-white">Saved Presets</h4>
                    <p className="text-xs text-zinc-400">Save and manage your mandala configurations</p>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => setShowPresetInput(!showPresetInput)}
                    className="bg-green-500 text-black hover:bg-green-600"
                  >
                    <Plus className="w-3 h-3 mr-2" />
                    New Preset
                  </Button>
                </div>

                {/* New Preset Input */}
                {showPresetInput && (
                  <div className="p-4 bg-zinc-800 rounded-lg">
                    <div className="flex gap-2">
                      <Input
                        value={newPresetName}
                        onChange={(e) => setNewPresetName(e.target.value)}
                        placeholder="Enter preset name..."
                        className="bg-zinc-700 border-zinc-600 text-zinc-300"
                        onKeyPress={(e) => e.key === 'Enter' && savePreset()}
                      />
                      <Button
                        size="sm"
                        onClick={savePreset}
                        disabled={!newPresetName.trim()}
                        className="bg-green-500 text-black hover:bg-green-600 disabled:bg-zinc-600 disabled:text-zinc-400"
                      >
                        <Check className="w-3 h-3" />
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setShowPresetInput(false);
                          setNewPresetName("");
                        }}
                        className="border-zinc-600 hover:bg-zinc-700"
                      >
                        <X className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                )}

                {/* Saved Presets List */}
                {savedPresets.length > 0 && (
                  <div className="space-y-2">
                    {savedPresets.map((preset) => (
                      <div key={preset.key} className="flex items-center gap-2 p-3 bg-zinc-800 rounded-lg">
                        <div className="flex-1">
                          <span className="text-sm font-medium text-zinc-300">{preset.name}</span>
                        </div>
                        <Button
                          size="sm"
                          onClick={() => loadPreset(preset)}
                          className="bg-blue-500 text-white hover:bg-blue-600"
                        >
                          Load
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => deletePreset(preset)}
                          className="border-red-500 text-red-500 hover:bg-red-500 hover:text-white"
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}

                {savedPresets.length === 0 && !showPresetInput && (
                  <div className="p-4 bg-zinc-800 rounded-lg text-center">
                    <p className="text-sm text-zinc-400">No presets saved yet. Create your first preset!</p>
                  </div>
                )}
              </div>

              {/* Export Section */}
              <div className="space-y-3">
                <h4 className="text-sm font-semibold text-white">Export</h4>
                <div>
                  <label className="text-xs text-zinc-400 block mb-2">Resolution (px)</label>
                  <Input
                    type="number"
                    value={size}
                    onChange={(e) => setSize(parseInt(e.target.value) || 1024)}
                    min={256}
                    max={8192}
                    step={256}
                    className="bg-zinc-800 border-zinc-700 text-zinc-300 text-sm"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}