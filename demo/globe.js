// A globe drawn from the dataset itself: every one of the 621,128 places is a
// point of light, so the coastlines are not a texture — they are the data.
// Raw WebGL, no library, so the project's zero-dependency rule still holds.

const DIST = 3.05;          // camera distance from the sphere centre
const FOV = 40 * Math.PI / 180;

// --- the little bit of matrix maths we need, rather than a library ----------
const perspective = (fov, aspect, near, far) => {
  const f = 1 / Math.tan(fov / 2), d = near - far;
  return [f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) / d, -1, 0, 0, (2 * far * near) / d, 0];
};
const multiply = (a, b) => {
  const o = new Array(16);
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) {
    o[r * 4 + c] = a[c] * b[r * 4] + a[4 + c] * b[r * 4 + 1] + a[8 + c] * b[r * 4 + 2] + a[12 + c] * b[r * 4 + 3];
  }
  return o;
};
const rotationYX = (yaw, pitch) => {
  const cy = Math.cos(yaw), sy = Math.sin(yaw), cx = Math.cos(pitch), sx = Math.sin(pitch);
  // R = Rx(pitch) · Ry(yaw)
  return [cy, sx * sy, -cx * sy, 0, 0, cx, sx, 0, sy, -sx * cy, cx * cy, 0, 0, 0, 0, 1];
};
const translation = (x, y, z) => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1];

// Our lat/lon convention, used in both directions so picking matches drawing.
const toXYZ = (latDeg, lonDeg) => {
  const la = latDeg * Math.PI / 180, lo = lonDeg * Math.PI / 180, c = Math.cos(la);
  return [c * Math.sin(lo), Math.sin(la), c * Math.cos(lo)];
};

const VERT = `
attribute vec3 pos;
attribute float kind;
uniform mat4 mvp;
uniform mat3 rot;
uniform float scale;
uniform float pulse;
varying float vFacing;
varying float vKind;
void main() {
  vec3 r = rot * pos;
  vFacing = r.z;                        // > 0 is the hemisphere facing us
  vKind = kind;
  gl_Position = mvp * vec4(pos, 1.0);
  float size = kind > 1.5 ? 17.0 * pulse : (kind > 0.5 ? 2.3 : 1.7);
  gl_PointSize = size * scale;
}`;

const FRAG = `
precision mediump float;
varying float vFacing;
varying float vKind;
uniform vec3 near;
uniform vec3 far;
void main() {
  vec2 d = gl_PointCoord - vec2(0.5);
  float rr = dot(d, d);
  if (rr > 0.25) discard;               // round points, not squares
  if (vKind > 1.5) {                    // the marker: a ring, so it reads as a target
    if (vFacing < -0.02) discard;
    float e = smoothstep(0.25, 0.16, rr) * smoothstep(0.055, 0.10, rr);
    if (e < 0.02) discard;
    gl_FragColor = vec4(near, e);
    return;
  }
  if (vFacing < -0.15) discard;         // hide the far side
  float lit = smoothstep(-0.15, 0.55, vFacing);
  vec3 c = mix(far, near, vKind);
  gl_FragColor = vec4(c, lit * (vKind > 0.5 ? 0.95 : 0.55));
}`;

const compile = (gl, type, src) => {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
  return s;
};

export function createGlobe(canvas, { lat, lon, cityOf }, palette) {
  const gl = canvas.getContext('webgl', { antialias: true, alpha: true })
          || canvas.getContext('experimental-webgl');
  if (!gl) return null;

  const n = lat.length;
  const pos = new Float32Array(n * 3);
  const kind = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const [x, y, z] = toXYZ(lat[i], lon[i]);
    pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z;
    kind[i] = cityOf[i] === i ? 1 : 0;   // a place that is its own city is a city
  }

  const prog = gl.createProgram();
  gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VERT));
  gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, FRAG));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
  gl.useProgram(prog);

  const bind = (data, name, size) => {
    const b = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, b);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, name);
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0);
    return b;
  };
  const posLoc = gl.getAttribLocation(prog, 'pos');
  const kindLoc = gl.getAttribLocation(prog, 'kind');
  const posBuf = bind(pos, 'pos', 3);
  const kindBuf = bind(kind, 'kind', 1);

  // One extra point marks whatever was last picked.
  const markPos = gl.createBuffer();
  const markKind = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, markKind);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([2]), gl.STATIC_DRAW);
  let marker = null;

  const U = (k) => gl.getUniformLocation(prog, k);
  const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  gl.uniform3fv(U('near'), hex(palette.near));
  gl.uniform3fv(U('far'), hex(palette.far));

  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

  let yaw = -(79 * Math.PI / 180), pitch = 22 * Math.PI / 180;   // open on India
  let spin = true, dpr = 1;

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
      canvas.width = w * dpr; canvas.height = h * dpr;
    }
    gl.viewport(0, 0, canvas.width, canvas.height);
  }

  function draw() {
    resize();
    const aspect = canvas.width / canvas.height || 1;
    const R = rotationYX(yaw, pitch);
    const mvp = multiply(perspective(FOV, aspect, 0.1, 10), multiply(translation(0, 0, -DIST), R));
    gl.uniformMatrix4fv(U('mvp'), false, new Float32Array(mvp));
    gl.uniformMatrix3fv(U('rot'), false, new Float32Array([R[0], R[1], R[2], R[4], R[5], R[6], R[8], R[9], R[10]]));
    // Keep points a constant visual size regardless of screen density or size.
    gl.uniform1f(U('scale'), dpr * Math.min(1.9, Math.max(0.85, canvas.height / dpr / 620)));
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.uniform1f(U('pulse'), 1);
    gl.bindBuffer(gl.ARRAY_BUFFER, posBuf); gl.vertexAttribPointer(posLoc, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, kindBuf); gl.vertexAttribPointer(kindLoc, 1, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.POINTS, 0, n);

    if (marker) {
      gl.uniform1f(U('pulse'), 1 + 0.16 * Math.sin(performance.now() / 260));
      gl.bindBuffer(gl.ARRAY_BUFFER, markPos); gl.vertexAttribPointer(posLoc, 3, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, markKind); gl.vertexAttribPointer(kindLoc, 1, gl.FLOAT, false, 0, 0);
      gl.drawArrays(gl.POINTS, 0, 1);
    }
  }

  let raf = 0, last = performance.now();
  const loop = (t) => {
    if (spin) yaw += (t - last) * 0.00006;
    last = t;
    draw();
    raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);

  // Screen point -> ray -> sphere -> lat/lon. The inverse of how points are
  // drawn, so what you click is what you get.
  function pick(clientX, clientY) {
    const r = canvas.getBoundingClientRect();
    const ndcX = ((clientX - r.left) / r.width) * 2 - 1;
    const ndcY = 1 - ((clientY - r.top) / r.height) * 2;
    const t = Math.tan(FOV / 2), aspect = r.width / r.height;
    const d = [ndcX * t * aspect, ndcY * t, -1];
    const len = Math.hypot(...d);
    const dir = d.map((v) => v / len);
    // Ray from the camera at the origin; sphere centred at (0,0,-DIST), radius 1.
    // With L = O - C = (0,0,DIST): t² + 2(L·d)t + |L|² - r² = 0.
    const b = 2 * DIST * dir[2];
    const c = DIST * DIST - 1;
    const disc = b * b - 4 * c;
    if (disc < 0) return null;                       // clicked past the horizon
    const tHit = (-b - Math.sqrt(disc)) / 2;
    if (tHit <= 0) return null;
    // Hit point relative to the sphere centre, still in view space.
    const q = [dir[0] * tHit, dir[1] * tHit, dir[2] * tHit + DIST];
    const M = rotationYX(yaw, pitch);            // row-major-ish column layout
    // Undo the rotation: R is orthonormal, so the transpose inverts it.
    const x = M[0] * q[0] + M[1] * q[1] + M[2] * q[2];
    const y = M[4] * q[0] + M[5] * q[1] + M[6] * q[2];
    const z = M[8] * q[0] + M[9] * q[1] + M[10] * q[2];
    const latDeg = Math.asin(Math.max(-1, Math.min(1, y))) * 180 / Math.PI;
    const lonDeg = Math.atan2(x, z) * 180 / Math.PI;
    return { lat: latDeg, lon: lonDeg };
  }

  function spinTo(latDeg, lonDeg) {
    spin = false;
    const targetYaw = -lonDeg * Math.PI / 180;
    const targetPitch = Math.max(-1.35, Math.min(1.35, latDeg * Math.PI / 180));
    const fromYaw = yaw, fromPitch = pitch, t0 = performance.now();
    // Take the short way round.
    let dy = targetYaw - fromYaw;
    while (dy > Math.PI) dy -= 2 * Math.PI;
    while (dy < -Math.PI) dy += 2 * Math.PI;
    const step = (t) => {
      const k = Math.min(1, (t - t0) / 700);
      const e = 1 - Math.pow(1 - k, 3);
      yaw = fromYaw + dy * e;
      pitch = fromPitch + (targetPitch - fromPitch) * e;
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  function setMarker(latDeg, lonDeg) {
    marker = true;
    gl.bindBuffer(gl.ARRAY_BUFFER, markPos);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(toXYZ(latDeg, lonDeg)), gl.DYNAMIC_DRAW);
  }

  return {
    pick, spinTo, setMarker,
    get spinning() { return spin; },
    set spinning(v) { spin = v; },
    drag(dx, dy) {
      spin = false;
      yaw += dx * 0.005;
      pitch = Math.max(-1.35, Math.min(1.35, pitch + dy * 0.005));
    },
    destroy() { cancelAnimationFrame(raf); },
  };
}
