void mainImage(out vec4 fragColor, in vec2 fragCoord)
{
  fragColor = vec4(sin(fragCoord.x/iResolution.x+iTime)/2.0+0.5, sin(fragCoord.y/iResolution.y+iTime)/2.0+0.5, cos(fragCoord.x/iResolution.x+fragCoord.y/iResolution.y+iTime)/2.0+0.5, 1.0);
}
