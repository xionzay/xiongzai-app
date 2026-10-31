// Rasterize the existing Web CSS canvas into small native backgrounds.
// No external image service, network, personal content, or dependencies.
import AppKit

let destination = URL(fileURLWithPath: CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : "assets/approved-ui")
let blue = [188.0, 234.0, 255.0]
func mix(_ a: [Double], _ b: [Double], _ t: Double) -> [Double] {
    zip(a, b).map { $0 + ($1 - $0) * min(1, max(0, t)) }
}
for seller in [false, true] {
    for dock in [false, true] {
        let width = 640, height = dock ? 128 : 1280
        let bitmap = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: width, pixelsHigh: height, bitsPerSample: 8, samplesPerPixel: 3, hasAlpha: false, isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: width * 3, bitsPerPixel: 24)!
        let pixels = bitmap.bitmapData!
        for y in 0..<height {
            for x in 0..<width {
                let u = Double(x) / Double(width - 1), v = Double(y) / Double(height - 1)
                let t = dock ? u : (0.819152 * u + 0.573576 * v) / 1.392728
                let middle = dock ? (seller ? [206.0, 221.0, 247.0] : [213.0, 239.0, 241.0]) : [217.0, 243.0, 255.0]
                let end = dock ? (seller ? [223.0, 201.0, 250.0] : [255.0, 240.0, 188.0]) : [237.0, 250.0, 255.0]
                let stop = dock ? 0.55 : 0.62
                var rgb = t <= stop ? mix(blue, middle, t / stop) : mix(middle, end, (t - stop) / (1 - stop))
                if !dock {
                    let radius = sqrt(pow((u - 1) / sqrt(2), 2) + pow((v - 0.38) / (sqrt(2) * 0.62), 2))
                    let alpha = radius <= 0.24 ? 1 - (1 - 122.0 / 255) * radius / 0.24 : max(0, 122.0 / 255 * (1 - (radius - 0.24) / 0.34))
                    let glow = seller ? mix([234, 217, 255], [239, 228, 255], radius / 0.24) : mix([255, 249, 218], [255, 251, 228], radius / 0.24)
                    rgb = mix(rgb, glow, alpha)
                }
                let offset = y * width * 3 + x * 3
                for channel in 0..<3 { pixels[offset + channel] = UInt8(rgb[channel].rounded()) }
            }
        }
        let name = "\(seller ? "seller" : "buyer")-\(dock ? "dock" : "canvas").png"
        try bitmap.representation(using: .png, properties: [:])!.write(to: destination.appendingPathComponent(name))
    }
}
print("Rendered four approved CSS backgrounds")
