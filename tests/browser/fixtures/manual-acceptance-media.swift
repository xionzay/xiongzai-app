// Explicitly synthetic local-test media, not real game evidence or an approved upload.
// Usage: /usr/bin/swift tests/browser/fixtures/manual-acceptance-media.swift <empty directory>
import AVFoundation
import CoreGraphics
import CoreText
import CoreVideo
import Foundation
import ImageIO
import UniformTypeIdentifiers

func fail(_ code: Int) -> NSError {
  NSError(domain: "LocalAcceptanceMedia", code: code)
}

guard CommandLine.arguments.count == 2 else { throw fail(1) }
let directory = URL(fileURLWithPath: CommandLine.arguments[1], isDirectory: true)
guard try FileManager.default.contentsOfDirectory(atPath: directory.path).isEmpty else { throw fail(2) }

func text(_ value: String, in context: CGContext, at point: CGPoint, size: CGFloat) {
  let attributes: [NSAttributedString.Key: Any] = [
    NSAttributedString.Key(kCTFontAttributeName as String): CTFontCreateWithName("PingFangSC-Regular" as CFString, size, nil),
    NSAttributedString.Key(kCTForegroundColorAttributeName as String): CGColor(gray: 1, alpha: 1)
  ]
  context.textMatrix = .identity
  context.textPosition = point
  CTLineDraw(CTLineCreateWithAttributedString(NSAttributedString(string: value, attributes: attributes)), context)
}

func draw(_ context: CGContext, width: Int, height: Int, label: String, progress: CGFloat) {
  context.setFillColor(CGColor(red: 0.07, green: 0.18, blue: 0.31, alpha: 1))
  context.fill(CGRect(x: 0, y: 0, width: width, height: height))
  text("本地测试 · 合成素材", in: context, at: CGPoint(x: 16, y: height - 35), size: 19)
  text(label, in: context, at: CGPoint(x: 16, y: height / 2), size: 14)
  text("TEST ONLY / 非真实游戏履约", in: context, at: CGPoint(x: 16, y: 35), size: 12)
  context.setFillColor(CGColor(red: 0.2, green: 0.65, blue: 1, alpha: 1))
  context.fill(CGRect(x: 16, y: 15, width: CGFloat(width - 32) * progress, height: 8))
}

let colorSpace = CGColorSpaceCreateDeviceRGB()
let rgba = CGImageAlphaInfo.premultipliedLast.rawValue
for index in 0...5 {
  guard let context = CGContext(data: nil, width: 640, height: 360, bitsPerComponent: 8,
    bytesPerRow: 640 * 4, space: colorSpace, bitmapInfo: rgba) else { throw fail(3) }
  draw(context, width: 640, height: 360,
    label: index == 0 ? "本地测试商品图" : "本地测试截图 \(index) / 5",
    progress: CGFloat(index + 1) / 6)
  guard let image = context.makeImage() else { throw fail(4) }
  let name = index == 0 ? "local-test-product.png" : "local-test-evidence-\(index).png"
  guard let destination = CGImageDestinationCreateWithURL(directory.appendingPathComponent(name) as CFURL,
    UTType.png.identifier as CFString, 1, nil) else { throw fail(5) }
  CGImageDestinationAddImage(destination, image, nil)
  guard CGImageDestinationFinalize(destination) else { throw fail(6) }
}

let writer = try AVAssetWriter(outputURL: directory.appendingPathComponent("local-test-continuous.mp4"), fileType: .mp4)
let input = AVAssetWriterInput(mediaType: .video, outputSettings: [
  AVVideoCodecKey: AVVideoCodecType.h264, AVVideoWidthKey: 320, AVVideoHeightKey: 180
])
input.expectsMediaDataInRealTime = false
let adaptor = AVAssetWriterInputPixelBufferAdaptor(assetWriterInput: input,
  sourcePixelBufferAttributes: [kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA,
    kCVPixelBufferWidthKey as String: 320, kCVPixelBufferHeightKey as String: 180])
guard writer.canAdd(input) else { throw fail(7) }
writer.add(input)
guard writer.startWriting() else { throw fail(8) }
writer.startSession(atSourceTime: .zero)
for frame in 0..<200 {
  let timeout = Date().addingTimeInterval(5)
  while !input.isReadyForMoreMediaData && Date() < timeout { Thread.sleep(forTimeInterval: 0.001) }
  guard input.isReadyForMoreMediaData else { throw fail(9) }
  var buffer: CVPixelBuffer?
  guard CVPixelBufferCreate(kCFAllocatorDefault, 320, 180, kCVPixelFormatType_32BGRA, nil, &buffer) == kCVReturnSuccess,
    let pixels = buffer else { throw fail(10) }
  CVPixelBufferLockBaseAddress(pixels, [])
  let bitmapInfo = CGBitmapInfo.byteOrder32Little.rawValue | CGImageAlphaInfo.premultipliedFirst.rawValue
  guard let context = CGContext(data: CVPixelBufferGetBaseAddress(pixels), width: 320, height: 180,
    bitsPerComponent: 8, bytesPerRow: CVPixelBufferGetBytesPerRow(pixels), space: colorSpace,
    bitmapInfo: bitmapInfo) else { CVPixelBufferUnlockBaseAddress(pixels, []); throw fail(11) }
  draw(context, width: 320, height: 180,
    label: "连续帧 \(frame + 1) / 200 · \(frame / 10).\(frame % 10)秒",
    progress: CGFloat(frame + 1) / 200)
  CVPixelBufferUnlockBaseAddress(pixels, [])
  guard adaptor.append(pixels, withPresentationTime: CMTime(value: Int64(frame), timescale: 10)) else { throw fail(12) }
}
writer.endSession(atSourceTime: CMTime(value: 20, timescale: 1))
input.markAsFinished()
let done = DispatchSemaphore(value: 0)
writer.finishWriting { done.signal() }
guard done.wait(timeout: .now() + 20) == .success, writer.status == .completed else { throw fail(13) }
print("local_test_images=6 local_test_video_frames=200 duration_seconds=20 uploaded=false reviewed=false")
