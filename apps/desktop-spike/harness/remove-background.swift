import CoreImage
import Foundation
import Vision

// Local macOS fallback when the image model ignores the green-background prompt.
// No network, credentials, or provider SDKs are involved.
guard CommandLine.arguments.count == 3 else { exit(2) }
let input = URL(fileURLWithPath: CommandLine.arguments[1])
let output = URL(fileURLWithPath: CommandLine.arguments[2])
do {
    let handler = VNImageRequestHandler(url: input)
    let request = VNGenerateForegroundInstanceMaskRequest()
    try handler.perform([request])
    guard let result = request.results?.first, !result.allInstances.isEmpty else { exit(3) }
    let pixels = try result.generateMaskedImage(
        ofInstances: result.allInstances, from: handler, croppedToInstancesExtent: false
    )
    try CIContext().writePNGRepresentation(
        of: CIImage(cvPixelBuffer: pixels), to: output, format: .RGBA8,
        colorSpace: CGColorSpace(name: CGColorSpace.sRGB)!
    )
} catch {
    // Avoid raw framework diagnostics in durable evidence.
    FileHandle.standardError.write(Data("Local foreground segmentation failed\n".utf8))
    exit(1)
}
