// Stands in for sharp in the narrator bundle (scripts/build-runtime.ts). Kokoro reads no images, but the library it
// loads refuses to start without an image reader, so this one is there and fails only if used.
export default function sharp(): never {
  throw new Error("The narrator reads no images.")
}
