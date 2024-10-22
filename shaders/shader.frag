#version 300 es 
precision mediump float;
#pragma vscode_glsllint_stage : frag

const float PI = 3.1415926;

uniform vec2 u_resolution;
uniform float u_time;

in vec2 vUv;
out vec4 frag_color;

void main()
{
  frag_color = vec4(sin(vUv.x+u_time / 1000.0)/2.0+0.5, sin(vUv.y+u_time / 1000.0)/2.0+0.5, cos(vUv.x+vUv.y+u_time / 1000.0)/2.0+0.5, 1.0);
}
