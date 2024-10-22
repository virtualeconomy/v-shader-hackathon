#!/bin/bash
trunk build --release
for i in $(ls dist/*.wasm); do
  echo "Compressing file $i";
  wasm-strip $i
  wasm-opt -Os -o $i $i
done
for i in $(ls dist/*.js); do
  echo "Correcting js filename $i in index.html";
  filename=$(basename ${i})
  sed -i -e "s/dynamic_javascript_filename.js/${filename}/g" dist/index.html
done
# Reading shader code
shader_text=$(<shaders/shader.frag)
# Replace new line \n and division sign /
shader_text=$(sed ':a;N;$!ba;s/\n/\\\\n\\\\\\n/g;s/\//\\\//g' <<< $shader_text)
echo "Correcting default shader code in textarea"
# Replace marker with shader code in index.html
sed -i -e "s/default_shader_code_text/${shader_text}/g" dist/index.html