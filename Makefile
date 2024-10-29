# abc def
# === common
#

# Parameters
TRUNK = trunk
WASM_OPT = wasm-opt
WASM_STRIP = wasm-strip

# Paths
DIST_DIR = dist
SHADERS_DIR = shaders
SHADER_FILE = $(SHADERS_DIR)/shader.frag
INDEX_HTML = $(DIST_DIR)/index.html

# Comma
comma := ,

# Checks two given strings for equality.
eq = $(if $(or $(1),$(2)),$(and $(findstring $(1),$(2)),\
                                $(findstring $(2),$(1))),1)

#
# === Install dependencies commands
#

# The main command to install all dependencies
deps-install: trunk-install binaryen-install wabt-install

# Installation of Trunk using Cargo
trunk-install:
	@which trunk || (echo "Installing Trunk..." && \
		cargo install trunk)

# Installation of Binaryen (for wasm-opt)
binaryen-install:
	@which wasm-opt || (echo "Installing Binaryen tools..." && \
		curl -L https://github.com/WebAssembly/binaryen/releases/download/version_119/binaryen-version_119-x86_64-linux.tar.gz | tar xz && \
		sudo mv binaryen-version_119/bin/* /usr/local/bin/ && \
		rm -rf binaryen-version_119)

# Installation of WABT (for wasm-strip)
wabt-install:
	@which wasm-strip || (echo "Installing WABT tools..." && \
		curl -L https://github.com/WebAssembly/wabt/releases/download/1.0.36/wabt-1.0.36-ubuntu-20.04.tar.gz | tar xz && \
		sudo mv wabt-1.0.36/bin/* /usr/local/bin/ && \
		rm -rf wabt-1.0.36)

#
# === External cargo crates commands
#

# Check vulnerabilities with cargo-audit.
#
# Usage :
# make audit
audit:
	cargo audit

#
# === General commands
#

# Lint Rust sources with Clippy.
#
# Usage :
# make lint [warnings=(no|yes)] [manifest_path=(|[path])]

lint :
	cargo clippy --all-features \
		$(if $(call eq,$(manifest_path),),--manifest-path ./Cargo.toml,--manifest-path $(manifest_path)) \
		$(if $(call eq,$(warnings),no),-- -D warnings,)

# Check Rust sources `check`.
#
# Usage :
# make check [manifest_path=(|[path])]

check :
	cargo check \
		$(if $(call eq,$(manifest_path),),--manifest-path ./Cargo.toml,--manifest-path $(manifest_path))

# Format and lint Rust sources.
#
# Usage :
# make normalize

normalize : fmt lint

# Format Rust sources with rustfmt.
#
# Usage :
# make fmt [check=(no|yes)]

fmt :
	cargo +nightly fmt --all $(if $(call eq,$(check),yes),-- --check,)

# Run project Rust sources with Cargo.
#
# Usage :
# make clean

clean :
	cargo clean && rm -rf Cargo.lock && cargo cache -a && cargo update

#
# === Build package commands
#

# Default build
build-all: build-wasm optimize-wasm optimize-js replace-shader

# 1. Build wasm with Trunk
build-wasm:
	@echo "Building project with Trunk..."
	$(TRUNK) build --release

# 2. Optimization of wasm: wasm-strip + wasm-opt
optimize-wasm:
	@for file in $(wildcard $(DIST_DIR)/*.wasm); do \
		echo "Compressing $$file..."; \
		$(WASM_STRIP) $$file; \
		$(WASM_OPT) -Os -o $$file $$file; \
	done

# 3. Updating js filenames of generated files in index.html
optimize-js:
	@for js_file in $(wildcard $(DIST_DIR)/*.js); do \
		echo "Correcting JS filename in index.html: $$js_file"; \
		filename=$$(basename $$js_file); \
		sed -i -e "s/dynamic_javascript_filename.js/$$filename/g" $(INDEX_HTML); \
	done

# 4. Replacing default shader code in index.html
replace-shader: $(SHADER_FILE)
	@echo "Reading shader code from $(SHADER_FILE)..."
	@shader_text=$$(sed ':a;N;$$!ba;s/\n/\\\\n\\\\\\n/g;s/\//\\\//g' < $<); \
	echo "Replacing default shader code in index.html..."; \
	sed -i -e "s/default_shader_code_text/$$shader_text/g" $(INDEX_HTML)

# Видалення згенерованих файлів (якщо потрібно)
clean-dist:
	rm -rf $(DIST_DIR)

# Command list
.PHONY: deps-install trunk-install binaryen-install wabt-install \
  build-all build-wasm optimize-wasm optimize-js replace-shader clean-dist \
  audit \
  lint \
  check \
  fmt \
  normalize \
  clean

