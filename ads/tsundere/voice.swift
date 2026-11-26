// Gives the ad its voice: raises each spoken line (voice/rawN.aiff, made with macOS `say`) into a brighter,
// higher anime-style voice, lines them up with the speech bubbles, and adds them to the video.
//   swiftc -O voice.swift -o voice && ./voice in.mp4 out.mp4 0.75 4.55 ...   (start second for each line)
import AVFoundation

let args = CommandLine.arguments
let video = URL(fileURLWithPath: args[1]), out = URL(fileURLWithPath: args[2])
let starts = args.dropFirst(3).map { Double($0)! }
let PITCH: Float = 450   // cents up (+4.5 semitones)
let RATE: Float = 1.08   // a little quicker, without changing pitch further

func brighten(_ src: URL, _ dst: URL) throws {
  let file = try AVAudioFile(forReading: src)
  let engine = AVAudioEngine(), player = AVAudioPlayerNode(), tp = AVAudioUnitTimePitch()
  tp.pitch = PITCH; tp.rate = RATE
  engine.attach(player); engine.attach(tp)
  engine.connect(player, to: tp, format: file.processingFormat)
  engine.connect(tp, to: engine.mainMixerNode, format: file.processingFormat)
  try engine.enableManualRenderingMode(.offline, format: file.processingFormat, maximumFrameCount: 4096)
  try engine.start(); player.scheduleFile(file, at: nil); player.play()
  let outFile = try AVAudioFile(forWriting: dst, settings: file.processingFormat.settings)
  let buf = AVAudioPCMBuffer(pcmFormat: engine.manualRenderingFormat, frameCapacity: 4096)!
  let total = AVAudioFramePosition(Double(file.length) / Double(RATE)) + 2048
  while engine.manualRenderingSampleTime < total {
    let n = min(4096, AVAudioFrameCount(total - engine.manualRenderingSampleTime))
    if try engine.renderOffline(n, to: buf) == .success { try outFile.write(from: buf) }
  }
  engine.stop()
}

let sem = DispatchSemaphore(value: 0)
Task {
  do {
    let comp = AVMutableComposition()
    let src = AVURLAsset(url: video)
    let vt = try await src.loadTracks(withMediaType: .video)[0]
    let dur = try await src.load(.duration)
    let cv = comp.addMutableTrack(withMediaType: .video, preferredTrackID: kCMPersistentTrackID_Invalid)!
    try cv.insertTimeRange(CMTimeRange(start: .zero, duration: dur), of: vt, at: .zero)
    let ca = comp.addMutableTrack(withMediaType: .audio, preferredTrackID: kCMPersistentTrackID_Invalid)!
    for (i, s) in starts.enumerated() {
      let dir = video.deletingLastPathComponent().appendingPathComponent("voice")
      let wav = dir.appendingPathComponent("line\(i).caf")
      try? FileManager.default.removeItem(at: wav)
      try brighten(dir.appendingPathComponent("raw\(i).aiff"), wav)
      let a = AVURLAsset(url: wav)
      let at = try await a.loadTracks(withMediaType: .audio)[0]
      var len = try await a.load(.duration)
      let next = i + 1 < starts.count ? starts[i + 1] : dur.seconds
      if s + len.seconds > next { print("line \(i) runs \(String(format: "%.2f", s + len.seconds - next))s into the next one; trimmed"); len = CMTime(seconds: next - s - 0.02, preferredTimescale: 44100) }
      try ca.insertTimeRange(CMTimeRange(start: .zero, duration: len), of: at, at: CMTime(seconds: s, preferredTimescale: 44100))
    }
    try? FileManager.default.removeItem(at: out)
    let ex = AVAssetExportSession(asset: comp, presetName: AVAssetExportPresetHighestQuality)!
    try await ex.export(to: out, as: .mp4)
    print("wrote", out.path)
  } catch { print("failed:", error) }
  sem.signal()
}
sem.wait()
