void render_image( out vec4 fragColor, in vec2 fragCoord )
{
  fragColor = vec4
  (
    sin( fragCoord.x / u_resolution.x + u_time ) / 2.0 + 0.5, 
    sin( fragCoord.y / u_resolution.y + u_time ) / 2.0 + 0.5, 
    cos( fragCoord.x / u_resolution.x + fragCoord.y / u_resolution.y + u_time ) / 2.0 + 0.5, 
    1.0
  );
}
