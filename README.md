# Usage

All for viewing example just host /dist folder for example by Penguin (could be installed by `cargo install penguin-app`)

```bash
$ penguin serve ./dist
```

## Building

Build

```bash
$ make build-all
```

## Evnironment and Dependencies

Linux ennvironment is expected for building process.

Build tools uses:

1. `Trunk` Installation instructions are [here](https://trunkrs.dev/#install)
2. `wasm-strip` is part of wabt toolkit, you can download from [wabt releases](https://github.com/WebAssembly/wabt/releases) <b>OR</b> here is [build instruction](https://github.com/WebAssembly/wabt) <b>OR</b> you can comment out line of usage from build.sh
3. `wasm-opt` is part of binaryen toolkit, installation instructions [here](https://github.com/WebAssembly/binaryen?tab=readme-ov-file#releases) <b>OR</b> you can comment out line of usage from build.sh
4. `sed` and `bash` usually already installed on every linux machine

Or in case of linux simply run this to install all prerequisites

```bash
make deps-install
```

# Shaders

## Uniforms

Following uniforms are automatically declared for all fragment shaders similar to shadertoys.

| Declaration               | Description                                                    |
| ------------------------- | -------------------------------------------------------------- |
| uniform vec3 iResolution; | The viewport resolution (z is pixel aspect ratio, usually 1.0) |
| uniform float iTime;      | Current time in seconds                                        |
| uniform float iTimeDelta; | Time it takes to render a frame, in seconds                    |
| uniform int iFrame;       | Current frame                                                  |
| uniform float iFrameRate; | Number of frames rendered per second                           |
| uniform vec4 iMouse;      | xy = current pixel coords (if LMB is down). zw = click pixel   |
| uniform vec4 iDate;       | Year, month, day, time in seconds in .xyzw                     |

## Pixel Shader

Pixel shader should have following format (similar to shadertoys):

```GLSL
void mainImage(out vec4 fragColor, in vec2 fragCoord)
{
    // Could be some calculations
    fragColor = vec4( 1.0, 0.0, 0.0, 1.0 );
}
```

All other declaration should be compatible with GLSL

## API

### function set_fragment_shader(new_shader_code: string): void;

Passes shader code to WASM, if not called then default shader from shaders/shader.frag would be loaded

### function update_player_state(state: any): void;

Sets param of shader playback.

By default state is empty (player is unpaused, all uniforms (except iMouse) are calculated automatically), but it could be set like this:

```JavaScript
{
    uniforms: {
        resolution: {
            width: 1920,
            height: 1080,
            pixel_aspect_ratio: 1
        },
        time: 3600, // real time at start, but dependent from pause and speed
        time_delta: 0.02,   // dependent from speed
        frame: 100,
        frame_rate: 50,
        mouse: {
            x: 0,
            y: 0,
            down_x: 0,
            down_y: 0
        },
        date: {
            year: 2024,
            month: 10,
            day: 30,
            time: 3600  // real time, doesn't depend from pause or speed
        }
    },
    playback: {
        paused: true,   // Freezes iTime uniform and stops render
        speed: 1.0  // Speed can be negative (in this case iTime decreases and playback is backward) and zero (in this case iTime freezes, but this option doesn't stop render)
    }
}
```

<i> Once any uniform is set, it would not be calculated automatically until page refresh. Exception is iMouse, it could be set only via update_player_state() </i>

If loaded shader doesn't use some of listed uniforms, then rewriting it will not take effect

### function stop(state: any): void;

Stops animation till play() call

### function play(state: any): void;

Resumes animation after stop() call

### Event TrunkApplicationStarted

Emits on WASM finish loading

### Event WasmErrorEvent
<!-- qqq : ? -->

Emits when error occurred (console.log also prints error info independently). Usage example:

```Javascript
addEventListener("WasmErrorEvent", (event) => {
    // `event.detail` contains error message.
    alert(event.detail);
});
```

## Minimal code to start

1. For initialization calling `init` from js shipped with wasm is enough

```html
<script type="module" nonce="u4yenYsZSS48mOe0heMQug==">
  import init, * as bindings from "/wasm_shader_runner-32edfc57ede5ba0d.js";
  const wasm = await init("/wasm_shader_runner-32edfc57ede5ba0d_bg.wasm");

  window.wasmBindings = bindings;

  dispatchEvent(
    new CustomEvent("TrunkApplicationStarted", { detail: { wasm } })
  );
</script>
<link
  rel="modulepreload"
  href="/wasm_shader_runner-32edfc57ede5ba0d.js"
  crossorigin="anonymous"
  integrity="sha384-VjfC0Ntqs7xkTz8AA5BTur2hnet1K9tqQ7bj8uSwYubAEK6UIXyRf0R9SeeTuX8+"
/>
<link
  rel="preload"
  href="/wasm_shader_runner-32edfc57ede5ba0d_bg.wasm"
  crossorigin="anonymous"
  integrity="sha384-zVsc6mQjH++FC5WYSj3OEKfKrSiJd4iNxuhf0q3W5JdyMAV4Pbo1QKA1NZEYNfqh"
  as="fetch"
  type="application/wasm"
/>
```

In this code example paths of js and wasm contains hex value `32edfc57ede5ba0d` which may differ in files after running build script.
This code sample automatically generated in dist/index.html by build script
