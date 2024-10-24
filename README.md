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

1. `Trunk.rs` Installation instructions are at https://trunkrs.dev/#install
2. `wasm-strip` is part of wabt toolkit, you can download from https://github.com/WebAssembly/wabt/releases <b>OR</b> here is build instruction https://github.com/WebAssembly/wabt <b>OR</b> you can comment out line of usage from build.sh
3. `wasm-opt` is part of binaryen toolkit, installation instructions here https://github.com/WebAssembly/binaryen?tab=readme-ov-file#releases <b>OR</b> you can comment out line of usage from build.sh
4. `sed` and `bash` usually already installed on every linux machine

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
