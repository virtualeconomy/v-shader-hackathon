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
