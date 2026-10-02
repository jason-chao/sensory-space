# EEG bridge protocol

Version 1. Last updated 2026-10-03.

This is the format in which Sensory Space accepts live signals from an EEG device, or from any other body sensor, through a bridge. The bridge is a small program that talks to the device and serves this protocol over a WebSocket. Sensory Space is the client.

The protocol carries the stream model of **Lab Streaming Layer (LSL)**, the open standard used by research EEG software and supported by most EEG devices through an LSL connector. A stream here has the same description as an LSL stream (name, type, channel count, sample rate, channel format, source id, channel labels and units), and samples carry LSL-style timestamps. A bridge that already has LSL streams can relay them one to one. A bridge for a device without LSL can describe its data in the same terms. References: LSL stream info and the XDF channel metadata conventions (https://labstreaminglayer.readthedocs.io, https://github.com/sccn/xdf/wiki/Specifications).

## 1. Transport

- WebSocket, text frames, one JSON object per frame.
- The bridge is the server. Sensory Space connects to a URL the operator configures. When the page and the bridge are served from one origin, the default is `<origin>/bridge/eeg/ws`.
- No authentication is defined. Run the bridge on a trusted network, or put an authenticating proxy in front.
- The bridge sends `hello` first, then `samples` messages as data arrives, and `status` when something changes.

## 2. Messages from the bridge

### 2.1 hello

Sent once, immediately after the connection opens. Lists the streams the bridge can provide.

```json
{
  "type": "hello",
  "protocol": "sensory-space-eeg",
  "version": 1,
  "bridge": { "name": "example-bridge", "version": "1.0" },
  "streams": [
    {
      "id": "eeg",
      "name": "Headband EEG",
      "type": "EEG",
      "channel_count": 4,
      "nominal_srate": 256,
      "channel_format": "float32",
      "source_id": "headband-1234",
      "channels": [
        { "label": "TP9", "unit": "microvolts", "type": "EEG" },
        { "label": "AF7", "unit": "microvolts", "type": "EEG" },
        { "label": "AF8", "unit": "microvolts", "type": "EEG" },
        { "label": "TP10", "unit": "microvolts", "type": "EEG" }
      ],
      "desc": { "manufacturer": "Example", "model": "Headband" }
    },
    {
      "id": "hr", "name": "Heart rate", "type": "HeartRate", "channel_count": 1, "nominal_srate": 0,
      "channel_format": "float32", "channels": [ { "label": "HR", "unit": "bpm" } ]
    }
  ]
}
```

Stream fields, following LSL:

| Field | Required | Meaning |
|---|---|---|
| `id` | yes | Short identifier used in `samples`. Unique within this bridge. |
| `name` | yes | Human-readable name. |
| `type` | yes | Content type. See section 4. |
| `channel_count` | yes | Number of values per sample. |
| `nominal_srate` | yes | Samples per second. `0` for irregular streams (heart rate, markers). |
| `channel_format` | yes | `float32`, `double64`, `int32`, `int16`, `int8` or `string`. Values are sent as JSON numbers or strings regardless. |
| `source_id` | no | Stable identifier of the device, as in LSL. |
| `channels` | yes | One object per channel: `label` (for EEG, the 10-20 electrode name), `unit`, optional `type`. |
| `desc` | no | Free metadata: manufacturer, model, anything else. |

### 2.2 samples

A chunk of one or more samples from one stream.

```json
{ "type": "samples", "stream": "eeg", "t0": 1024.1250, "dt": 0.00390625,
  "x": [ [12.1, -3.4, 5.0, 8.8], [11.7, -2.9, 4.6, 9.1] ] }
```

```json
{ "type": "samples", "stream": "hr", "t": [1024.50], "x": [ [62] ] }
```

- `x` is an array of samples; each sample is an array with `channel_count` values.
- Timestamps are seconds on the bridge's own monotonic clock (LSL `local_clock()` when relaying LSL). Either `t` gives one timestamp per sample, or `t0` plus `dt` gives the first timestamp and the sample interval. Timestamps need not start at zero and need not match the client's clock; only differences are used.
- Chunk size is the bridge's choice. For EEG, 10 to 20 chunks a second is sensible.

### 2.3 status

Optional. Sent when the bridge's state changes, and may be repeated periodically.

```json
{ "type": "status", "state": "streaming", "message": "Headset connected", "streams": { "eeg": "streaming", "hr": "idle" } }
```

`state` is one of `idle`, `searching`, `connecting`, `streaming`, `error`. `message` is text for the person. Per-stream states use the same words.

### 2.4 error

```json
{ "type": "error", "message": "No device found" }
```

## 3. Messages from Sensory Space

### 3.1 hb (heartbeat)

Sent every 5 seconds while connected.

```json
{ "type": "hb", "visible": true }
```

A bridge may use the heartbeat as a lease: start the device when a client is present and release it when no heartbeat has arrived for about 30 seconds. `visible` is false when the page is hidden; a bridge may treat a hidden client as absent.

### 3.2 subscribe

Optional. Asks for only some streams; a bridge that ignores it simply sends everything.

```json
{ "type": "subscribe", "streams": ["eeg", "hr"] }
```

## 4. Stream types and what Sensory Space does with them

Type names follow LSL conventions where LSL has one.

| `type` | Channels | Unit | Used for |
|---|---|---|---|
| `EEG` | one per electrode, labelled by the 10-20 system where possible | `microvolts` | Band powers and signal quality are computed in the browser from the raw samples (section 5). This is the baseline every EEG device can provide. |
| `EEGBands` | labels containing `delta`, `theta`, `alpha`, `beta`, `gamma` (prefixes such as `low_alpha` are accepted) | `relative` (shares of total) or any absolute unit | Used directly instead of computing from raw EEG. For devices that publish their own band powers. If both `EEG` and `EEGBands` are present, `EEGBands` is used. |
| `Quality` | one per EEG channel, or one overall | `fraction` (0 = no contact, 1 = good) | Scales how much the EEG is allowed to influence the space. |
| `HeartRate` | 1 | `bpm` | The pulse layer's rate. Values outside 30 to 200 are ignored. |
| `RR` | 1 | `milliseconds` | Reserved for heart-rate variability; accepted, not yet used. |
| `Accelerometer` | 3 | `g` or `m/s^2` | Head movement. |
| `Gyroscope` | 3 | `deg/s` or `degrees` | Head movement. |
| `Markers` | 1 | `string` | Accepted, not used. |

Unknown types are accepted and ignored, so a bridge may relay everything it has.

**Minimum useful bridge:** one `EEG` stream. Everything else is optional. With no `Quality` stream, quality is estimated from the signal itself.

## 5. What the client computes from raw EEG

So that any device works the same way:

- Each channel keeps the last 2 seconds. Once a second, the power spectrum of each channel is taken (Hann window, FFT) and summed into bands: delta 1 to 4 Hz, theta 4 to 8, alpha 8 to 13, beta 13 to 30, gamma 30 to 45. Relative powers are shares of the 1 to 45 Hz total.
- A channel window is rejected when its peak-to-peak amplitude exceeds 300 microvolts (eye blinks, movement) or when it is flat (standard deviation under 0.5 microvolts, meaning no contact or a disconnected lead). Rejection only applies when the unit is microvolts; other units skip the amplitude checks.
- Relative band powers are averaged over the accepted channels. Signal quality is the share of accepted channels, multiplied by the `Quality` stream's value when one exists.
- From these, the app derives its usual signals: alpha, theta and beta shares, and a "calm index" defined as (theta + alpha) / (theta + alpha + beta). All are then normalised against the wearer's own running baseline, as for every signal (see RESEARCH.md, decision D12).

Sample rates below 100 Hz still work (gamma is simply absent above the Nyquist limit). Rates above 1000 Hz are decimated by the client.

## 6. Versioning

`version` in `hello` is the protocol version. The client accepts the same major version. Additions of new message fields, stream types or units do not change the version; a change in the meaning of an existing field does.

## 7. Example session

```
bridge  -> {"type":"hello", ...}
client  -> {"type":"subscribe","streams":["eeg","hr"]}
client  -> {"type":"hb","visible":true}
bridge  -> {"type":"status","state":"searching","message":"Looking for the headset"}
bridge  -> {"type":"status","state":"streaming","message":"Headset connected"}
bridge  -> {"type":"samples","stream":"eeg","t0":10.000,"dt":0.00390625,"x":[...25 samples...]}
bridge  -> {"type":"samples","stream":"eeg","t0":10.098,"dt":0.00390625,"x":[...]}
bridge  -> {"type":"samples","stream":"hr","t":[10.5],"x":[[64]]}
client  -> {"type":"hb","visible":true}          (every 5 s)
...
```

## 8. Relaying LSL

A bridge that relays LSL streams maps the fields directly: `name`, `type`, `channel_count`, `nominal_srate`, `channel_format` and `source_id` from the stream info; `channels` from the `desc/channels/channel` elements (`label`, `unit`, `type`); samples from `pull_chunk()` with their timestamps in `t`. No reference relay is included at present.
