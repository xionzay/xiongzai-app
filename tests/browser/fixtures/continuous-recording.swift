// A synthetic, continuous two-second H.264 test clip. No device, network or real user data.
import AVFoundation
import CoreVideo
import Foundation

let output = URL(fileURLWithPath: CommandLine.arguments[1])
let writer = try AVAssetWriter(outputURL: output, fileType: .mp4)
let input = AVAssetWriterInput(mediaType: .video, outputSettings: [
  AVVideoCodecKey: AVVideoCodecType.h264,
  AVVideoWidthKey: 64, AVVideoHeightKey: 64
])
input.expectsMediaDataInRealTime = false
let adaptor = AVAssetWriterInputPixelBufferAdaptor(assetWriterInput: input,
  sourcePixelBufferAttributes: [kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA,
    kCVPixelBufferWidthKey as String: 64, kCVPixelBufferHeightKey as String: 64])
writer.add(input)
guard writer.startWriting() else { throw writer.error! }
writer.startSession(atSourceTime: .zero)
for frame in 0..<20 {
  let until = Date().addingTimeInterval(5)
  while !input.isReadyForMoreMediaData && Date() < until { Thread.sleep(forTimeInterval: 0.001) }
  guard input.isReadyForMoreMediaData else { throw NSError(domain: "SyntheticClip", code: 1) }
  var buffer: CVPixelBuffer?
  guard CVPixelBufferCreate(kCFAllocatorDefault, 64, 64, kCVPixelFormatType_32BGRA, nil, &buffer) == kCVReturnSuccess,
    let pixels = buffer else { throw NSError(domain: "SyntheticClip", code: 2) }
  CVPixelBufferLockBaseAddress(pixels, [])
  let base = CVPixelBufferGetBaseAddress(pixels)!.assumingMemoryBound(to: UInt8.self)
  for y in 0..<64 { for x in 0..<64 {
    let offset = y * CVPixelBufferGetBytesPerRow(pixels) + x * 4
    base[offset] = 120; base[offset + 1] = UInt8(frame * 8); base[offset + 2] = UInt8(x * 3); base[offset + 3] = 255
  } }
  CVPixelBufferUnlockBaseAddress(pixels, [])
  guard adaptor.append(pixels, withPresentationTime: CMTime(value: Int64(frame), timescale: 10)) else { throw writer.error! }
}
input.markAsFinished()
let done = DispatchSemaphore(value: 0)
writer.finishWriting { done.signal() }
guard done.wait(timeout: .now() + 10) == .success, writer.status == .completed else {
  throw NSError(domain: "SyntheticClip", code: 3)
}
