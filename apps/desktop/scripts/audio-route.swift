// Sends the Mac's sound to BlackHole for a recording, and back afterward (scripts/record-playthrough.ts).
// `start` makes a Multi-Output Device of the current output and BlackHole, so the sound is heard and recorded at once,
// makes it the output, and prints the UID of the output it replaced. `stop <uid>` restores that output and removes the
// device. Without BlackHole installed, `start` fails.
import CoreAudio
import Foundation

let system = AudioObjectID(kAudioObjectSystemObject)
let routeUID = "com.d20adventures.recording"

func address(_ selector: AudioObjectPropertySelector) -> AudioObjectPropertyAddress {
  AudioObjectPropertyAddress(mSelector: selector, mScope: kAudioObjectPropertyScopeGlobal, mElement: kAudioObjectPropertyElementMain)
}
func devices() -> [AudioDeviceID] {
  var a = address(kAudioHardwarePropertyDevices)
  var size: UInt32 = 0
  AudioObjectGetPropertyDataSize(system, &a, 0, nil, &size)
  var ids = [AudioDeviceID](repeating: 0, count: Int(size) / MemoryLayout<AudioDeviceID>.size)
  AudioObjectGetPropertyData(system, &a, 0, nil, &size, &ids)
  return ids
}
func text(_ id: AudioDeviceID, _ selector: AudioObjectPropertySelector) -> String {
  var a = address(selector)
  var value: Unmanaged<CFString>?
  var size = UInt32(MemoryLayout<Unmanaged<CFString>?>.size)
  guard AudioObjectGetPropertyData(id, &a, 0, nil, &size, &value) == noErr, let v = value else { return "" }
  return v.takeRetainedValue() as String
}
func device(uid: String) -> AudioDeviceID? { devices().first { text($0, kAudioDevicePropertyDeviceUID) == uid } }
func output() -> AudioDeviceID {
  var a = address(kAudioHardwarePropertyDefaultOutputDevice)
  var id = AudioDeviceID(0)
  var size = UInt32(MemoryLayout<AudioDeviceID>.size)
  AudioObjectGetPropertyData(system, &a, 0, nil, &size, &id)
  return id
}
func setOutput(_ id: AudioDeviceID) {
  for selector in [kAudioHardwarePropertyDefaultOutputDevice, kAudioHardwarePropertyDefaultSystemOutputDevice] {
    var a = address(selector)
    var value = id
    AudioObjectSetPropertyData(system, &a, 0, nil, UInt32(MemoryLayout<AudioDeviceID>.size), &value)
  }
}
func removeRoute() {
  if let id = device(uid: routeUID) { AudioHardwareDestroyAggregateDevice(id) }
}
func fail(_ message: String) -> Never {
  FileHandle.standardError.write("\(message)\n".data(using: .utf8)!)
  exit(1)
}

let args = CommandLine.arguments
switch args.count > 1 ? args[1] : "" {
case "start":
  guard let hole = devices().first(where: { text($0, kAudioObjectPropertyName).hasPrefix("BlackHole") }) else { fail("BlackHole is not installed.") }
  let holeUID = text(hole, kAudioDevicePropertyDeviceUID)
  // A device left by a run that did not finish is put back first, so the output it replaced is the real one.
  var current = output()
  if text(current, kAudioDevicePropertyDeviceUID) == routeUID {
    if let speakers = device(uid: "BuiltInSpeakerDevice") { setOutput(speakers) }
  }
  removeRoute()
  current = output()
  let currentUID = text(current, kAudioDevicePropertyDeviceUID)
  if currentUID == holeUID {
    print(currentUID)
    exit(0)
  }
  let description: [String: Any] = [
    kAudioAggregateDeviceNameKey: "D20 Recording",
    kAudioAggregateDeviceUIDKey: routeUID,
    kAudioAggregateDeviceMainSubDeviceKey: currentUID,
    kAudioAggregateDeviceIsStackedKey: 1,
    kAudioAggregateDeviceSubDeviceListKey: [
      [kAudioSubDeviceUIDKey: currentUID],
      [kAudioSubDeviceUIDKey: holeUID, kAudioSubDeviceDriftCompensationKey: 1],
    ],
  ]
  var route = AudioDeviceID(0)
  guard AudioHardwareCreateAggregateDevice(description as CFDictionary, &route) == noErr else { fail("Could not make the recording output.") }
  // The new device takes a moment to be ready to play.
  Thread.sleep(forTimeInterval: 0.5)
  setOutput(route)
  print(currentUID)
case "stop":
  if args.count > 2, let previous = device(uid: args[2]) { setOutput(previous) }
  Thread.sleep(forTimeInterval: 0.3)
  removeRoute()
default:
  fail("usage: audio-route start | stop <uid>")
}
