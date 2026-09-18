import Foundation
import AVFoundation

// venc <in> <out> <width> <height> <kbps> <h264|hevc> [maxSeconds]
let a = CommandLine.arguments
guard a.count >= 7 else { print("args"); exit(2) }
let inURL = URL(fileURLWithPath: a[1])
let outURL = URL(fileURLWithPath: a[2])
let W = Int(a[3])!, H = Int(a[4])!, KBPS = Int(a[5])!
let codec: AVVideoCodecType = (a[6] == "hevc") ? .hevc : .h264
let maxSec = a.count > 7 ? Double(a[7])! : Double.greatestFiniteMagnitude

try? FileManager.default.removeItem(at: outURL)
let asset = AVURLAsset(url: inURL)
let sem = DispatchSemaphore(value: 0)
var track: AVAssetTrack?
Task {
    track = try? await asset.loadTracks(withMediaType: .video).first
    sem.signal()
}
sem.wait()
guard let vtrack = track else { print("no video track"); exit(3) }

let reader = try AVAssetReader(asset: asset)
let output = AVAssetReaderTrackOutput(track: vtrack, outputSettings: [
    kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_420YpCbCr8BiPlanarVideoRange
])
output.alwaysCopiesSampleData = false
reader.add(output)

let writer = try AVAssetWriter(outputURL: outURL, fileType: .mp4)
var compression: [String: Any] = [
    AVVideoAverageBitRateKey: KBPS * 1000,
    AVVideoMaxKeyFrameIntervalKey: 60,
    AVVideoAllowFrameReorderingKey: true
]
if codec == .h264 {
    compression[AVVideoProfileLevelKey] = AVVideoProfileLevelH264HighAutoLevel
}
let input = AVAssetWriterInput(mediaType: .video, outputSettings: [
    AVVideoCodecKey: codec,
    AVVideoWidthKey: W,
    AVVideoHeightKey: H,
    AVVideoScalingModeKey: AVVideoScalingModeResizeAspectFill,
    AVVideoCompressionPropertiesKey: compression
])
input.expectsMediaDataInRealTime = false
writer.add(input)
writer.shouldOptimizeForNetworkUse = true   // fast-start: moov at the front

writer.startWriting()
writer.startSession(atSourceTime: .zero)
reader.startReading()

let q = DispatchQueue(label: "enc")
let done = DispatchSemaphore(value: 0)
input.requestMediaDataWhenReady(on: q) {
    while input.isReadyForMoreMediaData {
        guard let buf = output.copyNextSampleBuffer() else {
            input.markAsFinished(); writer.finishWriting { done.signal() }; return
        }
        let t = CMSampleBufferGetPresentationTimeStamp(buf)
        if CMTimeGetSeconds(t) > maxSec {
            input.markAsFinished(); reader.cancelReading()
            writer.finishWriting { done.signal() }; return
        }
        input.append(buf)
    }
}
done.wait()
if writer.status == .failed { print("FAILED: \(writer.error!)"); exit(4) }
let sz = (try! FileManager.default.attributesOfItem(atPath: outURL.path)[.size] as! NSNumber).doubleValue
print(String(format: "%@  %dx%d  %.2f MB", outURL.lastPathComponent, W, H, sz/1e6))
