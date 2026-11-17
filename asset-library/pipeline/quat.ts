// Turns as quaternions, [x, y, z, w] as glTF keeps them, for the scripts that move a skeleton's clips about.

export type Quat = [number, number, number, number]
export type Vec = [number, number, number]

export const qmul = (a: Quat, b: Quat): Quat => [
  a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
  a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
  a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
  a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
]
export const qinv = (q: Quat): Quat => [-q[0], -q[1], -q[2], q[3]]
export const qall = (...q: Quat[]) => q.reduce(qmul)
// Where a turn takes a point.
export const qturn = ([x, y, z, w]: Quat, v: number[]): Vec => {
  const t = [2 * (y * v[2] - z * v[1]), 2 * (z * v[0] - x * v[2]), 2 * (x * v[1] - y * v[0])]
  return [v[0] + w * t[0] + y * t[2] - z * t[1], v[1] + w * t[1] + z * t[0] - x * t[2], v[2] + w * t[2] + x * t[1] - y * t[0]]
}
// Where a turn takes straight up.
export const qup = (q: Quat) => qturn(q, [0, 1, 0])
export const qunit = (q: number[]): Quat => {
  const long = Math.hypot(q[0], q[1], q[2], q[3]) || 1
  return [q[0] / long, q[1] / long, q[2] / long, q[3] / long]
}
// The turn between two, a share of the way, by the short way round.
export const qmix = (a: number[], b: number[], share: number): Quat => {
  const s = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3] < 0 ? -share : share
  return qunit([a[0] * (1 - share) + b[0] * s, a[1] * (1 - share) + b[1] * s, a[2] * (1 - share) + b[2] * s, a[3] * (1 - share) + b[3] * s])
}
// The least turn that takes one direction to another.
export const qbetween = (from: number[], to: number[]): Quat => {
  const [a, b] = [from, to].map((v) => {
    const long = Math.hypot(v[0], v[1], v[2]) || 1
    return [v[0] / long, v[1] / long, v[2] / long]
  })
  const dot = a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
  if (dot < -0.999999) return Math.abs(a[0]) < 0.9 ? qunit([0, -a[2], a[1], 0]) : qunit([-a[2], 0, a[0], 0])
  return qunit([a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0], 1 + dot])
}
