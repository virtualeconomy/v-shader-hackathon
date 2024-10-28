# Usage

All for viewing example just host /dist folder for example by

```bash
$ cd ./dist
$ python -m http.server
```

# Building

Run build script

```bash
$ ./build.sh
```

# Tools installation

Build tools uses:

1. `Trunk` Installation instructions are at https://trunkrs.dev/#install
2. `wasm-strip` is part of wabt toolkit, you can download from https://github.com/WebAssembly/wabt/releases <b>OR</b> here is build instruction https://github.com/WebAssembly/wabt <b>OR</b> you can comment out line of usage from build.sh
3. `wasm-opt` is part of binaryen toolkit, installation instructions here https://github.com/WebAssembly/binaryen?tab=readme-ov-file#releases <b>OR</b> you can comment out line of usage from build.sh
4. `sed` and `bash` usually already installed on every linux machine

Or simply run this to install all prerequisites

```bash
make deps-install
```

# Shaders

## Uniforms

Following uniforms are automaticaly declared for all fragment shaders similar to shadertoys.

| Declaration               | Description                                                    |
| ------------------------- | -------------------------------------------------------------- |
| uniform vec3 iResolution; | The viewport resolution (z is pixel aspect ratio, usually 1.0) |
| uniform float iTime;      | Current time in seconds                                        |
| uniform float iTimeDelta; | Time it takes to render a frame, in seconds                    |
| uniform int iFrame;       | Current frame                                                  |
| uniform float iFrameRate; | Number of frames rendered per second                           |
| uniform vec4 iMouse;      | xy = current pixel coords (if LMB is down). zw = click pixel   |
| uniform vec4 iDate;       | Year, month, day, time in seconds in .xyzw                     |

## Main function

Main function should have following format (similar to shadertoys):

```GLSL
void mainImage(out vec4 fragColor, in vec2 fragCoord)
{
    // Could be some calculations
    fragColor = /*value of vec4 type*/;
}
```

All other declaration should be compatible with GLSL

# WASM-JS API

## Functions:

### function set_fragment_shader(new_shader_code: string): void;

Passes shader code to WASM, if not called then default shader from shaders/shader.frag would be loaded

### function update_player_state(state: any): void;

Sets param of shader playback.

By default state is empty (player is unpaused, all uniforms (except iMouse) are calculated automatically), but it could be set like this:

```JSON
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

## Events:

### TrunkApplicationStarted

Emits on WASM finish loading

### WasmErrorEvent

Emits when error occured (console.log also prints error info independently). Usage example:

```Javascript
addEventListener("WasmErrorEvent", (event) => {
    // `event.detail` contains error message.
    alert(event.detail);
});
```
