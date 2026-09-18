import Foundation
import AVFoundation
import CoreImage
import AppKit

// frame <in.mp4> <out.jpg> <seconds> <maxWidth> <quality 0-1>
let a = CommandLine.arguments
let asset = AVURLAsset(url: URL(fileURLWithPath: a[1]))
let outURL = URL(fileURLWithPath: a[2])
let at = Double(a[3]) ?? 0
let maxW = CGFloat(Double(a[4]) ?? 1600)
let quality = Double(a[5]) ?? 0.72

let gen = AVAssetImageGenerator(asset: asset)
gen.appliesPreferredTrackTransform = true
gen.requestedTimeToleranceBefore = .zero
gen.requestedTimeToleranceAfter = .zero

let sem = DispatchSemaphore(value: 0)
var cg: CGImage?
Task {
    cg = try? await gen.image(at: CMTime(seconds: at, preferredTimescale: 600)).image
    sem.signal()
}
sem.wait()
guard let img = cg else { print("no frame"); exit(3) }

let scale = min(1, maxW / CGFloat(img.width))
let w = Int(CGFloat(img.width) * scale), h = Int(CGFloat(img.height) * scale)
let ctx = CGContext(data: nil, width: w, height: h, bitsPerComponent: 8, bytesPerRow: 0,
                    space: CGColorSpaceCreateDeviceRGB(),
                    bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue)!
ctx.interpolationQuality = .high
ctx.draw(img, in: CGRect(x: 0, y: 0, width: w, height: h))
let out = ctx.makeImage()!
let rep = NSBitmapImageRep(cgImage: out)
let data = rep.representation(using: .jpeg, properties: [.compressionFactor: quality])!
try data.write(to: outURL)
print(String(format: "%@  %dx%d  %.0f KB", outURL.lastPathComponent, w, h, Double(data.count)/1024))
