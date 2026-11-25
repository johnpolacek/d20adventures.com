import * as THREE from "three"
import { FullScreenQuad, Pass } from "three/addons/postprocessing/Pass.js"

// Depth of field: whoever the camera looks at stays sharp, and the frame softens in front of them and behind, as a
// real lens does. It reads the scene's own depth, so it costs no second scene pass. One gather pass over a spiral of
// taps (after Dennis Gustafsson's single-pass bokeh): a tap counts toward a pixel when its own blur reaches that far,
// so a sharp face does not smear onto the blurred wall behind it, and a blurred post in front still spills over it.
// It runs on the linear scene before bloom and the paint filter, which then paint over the softened frame.
const FS = `uniform sampler2D tColor, tDepth; uniform vec2 texel; uniform float near, far, focus, band, strength, maxBlur, step; varying vec2 vUv;
float lin(float z){ return 2.0 * near * far / (far + near - (z * 2.0 - 1.0) * (far - near)); }
// Blur in pixels: none inside the band around the focus, then growing with |1 - focus/d|, so a wall twice as far as the
// face is half blurred and the sky fully, at any scale of shot.
float coc(float d){ return clamp((abs(1.0 - focus / d) - band) * strength, 0.0, 1.0) * maxBlur; }
void main(){
 float cd = lin(texture2D(tDepth, vUv).x);
 float cs = coc(cd);
 vec3 c = texture2D(tColor, vUv).rgb;
 float tot = 1.0;
 float r = step;
 float a = 0.0;
 for (int i = 0; i < 96; i++) {
  if (r >= maxBlur) break;
  vec2 tc = vUv + vec2(cos(a), sin(a)) * texel * r;
  vec3 sc = texture2D(tColor, tc).rgb;
  float sd = lin(texture2D(tDepth, tc).x);
  float ss = coc(sd);
  // Something behind this pixel only blurs into it as far as this pixel is itself blurred.
  if (sd > cd) ss = min(ss, cs * 2.0);
  float m = smoothstep(r - 0.5, r + 0.5, ss);
  c += mix(c / tot, sc, m);
  tot += 1.0;
  r += step / r;
  a += 2.39996;
 }
 gl_FragColor = vec4(c / tot, 1.0);
}`

// About this many taps at the widest blur, whatever the size of the frame.
const TAPS = 48

export class FocusPass extends Pass {
  private quad: FullScreenQuad
  private mat: THREE.ShaderMaterial
  depth: THREE.Texture | null = null
  // Metres from the lens to what stays sharp. Eased toward `target` each frame, so a cut to a new subject racks focus.
  focus = 5
  target = 5
  // The widest blur as a share of the frame's height.
  reach = 0.008
  // How quickly the blur grows away from the focus, at a 35° lens. A narrower lens blurs more, as a long lens does.
  amount = 1.2
  // Share of the focus distance, either side, held sharp.
  band = 0.08
  // Focused past this many metres the blur fades out, as the square of the distance: a wide view of a gate 95 m off
  // keeps the crowd in front of it sharp, where blurring it would read as a model village.
  deep = 10

  constructor(private camera: THREE.PerspectiveCamera) {
    super()
    this.mat = new THREE.ShaderMaterial({
      uniforms: {
        tColor: { value: null },
        tDepth: { value: null },
        texel: { value: new THREE.Vector2() },
        near: { value: 0.3 },
        far: { value: 2400 },
        focus: { value: 5 },
        band: { value: this.band },
        strength: { value: 1 },
        maxBlur: { value: 8 },
        step: { value: 1 },
      },
      vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }",
      fragmentShader: FS,
      depthTest: false,
      depthWrite: false,
    })
    this.quad = new FullScreenQuad(this.mat)
  }

  // Ease the focus toward its target: about a third of a second to settle. `dt` 0 snaps.
  settle(dt: number) {
    this.focus = dt > 0 ? this.focus + (this.target - this.focus) * (1 - Math.exp(-dt * 8)) : this.target
  }

  setSize(w: number, h: number) {
    const u = this.mat.uniforms
    u.texel.value.set(1 / w, 1 / h)
    const max = Math.max(1, h * this.reach)
    u.maxBlur.value = max
    // The spiral's radius grows so r² gains 2·step a tap: about TAPS taps to reach the widest blur.
    u.step.value = Math.max(0.5, (max * max) / (2 * TAPS))
  }

  render(renderer: THREE.WebGLRenderer, writeBuffer: THREE.WebGLRenderTarget, readBuffer: THREE.WebGLRenderTarget) {
    const u = this.mat.uniforms
    u.tColor.value = readBuffer.texture
    u.tDepth.value = this.depth
    u.near.value = this.camera.near
    u.far.value = this.camera.far
    u.focus.value = Math.max(this.focus, this.camera.near * 2)
    u.band.value = this.band
    const far = Math.min(1, (this.deep / Math.max(this.focus, 0.01)) ** 2)
    u.strength.value = this.amount * far * THREE.MathUtils.clamp(35 / this.camera.getEffectiveFOV(), 0.5, 2.5)
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer)
    this.quad.render(renderer)
  }

  dispose() {
    this.mat.dispose()
    this.quad.dispose()
  }
}
