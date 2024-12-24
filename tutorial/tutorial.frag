
// Set the precision for floating-point operations
precision highp float;

// Mathematical constant for PI
const float PI = 3.14159265;

// Refractive index of air
const float airRI = 1.0;

// Refractive index of water (inside the box)
const float boxRI = 1.33;

// Index of refraction from air to box
const float iorAtoB = airRI / boxRI;

// Index of refraction from box to air
const float iorBtoA = boxRI / airRI;

// Fresnel reflectance at normal incidence
const vec3 F0 = vec3( pow( abs( ( boxRI - airRI ) ) / ( boxRI + airRI ), 2.0 ) );

// Color absorption factor for the box's material
const vec3 COLOR_ABSORPTION = vec3( 0.9 );

// Number of reflections to calculate inside the box
const int NUM_REFLECTIONS = 2;

// Dimensions of the box
const vec3 BOX_DIMENSIONS = vec3( 0.75, 1.25, 0.75 );

// Distances to the edges of the box
const vec3 BOX_DTE = vec3( length( BOX_DIMENSIONS.xz ), length( BOX_DIMENSIONS.xy ), length( BOX_DIMENSIONS.yz ) );

// Critical angle for total internal reflection from air to box
const float CRITICAL_ANGLE_ATOB = sqrt( max( 0.0, 1.0 - iorBtoA * iorBtoA ) );

// Critical angle for total internal reflection from box to air
const float CRITICAL_ANGLE_BTOA = sqrt( max( 0.0, 1.0 - iorAtoB * iorAtoB ) );

// Power of the light source
const float LIGHT_POWER = 15.0;

// Color for the edges of the box
const vec3 BOX_EDGE_COLOR = vec3( 0.0 );

// A point on a plane used for background rendering
const vec3 PLANE_P = vec3( 0.0, -BOX_DIMENSIONS.y - 0.001, 0.0 );

// Constants for vector manipulation
const vec2 M = vec2( 1.0, 0.0 );

// Noise scale on the box's faces
const float INSIDES_NOISE = 0.3;

// Intensity of the waves on the box's faces
const float WATER_INTENSITY = 0.5;

// Scale factor for the inside of the box
const float INNER_BOX_SCALE = 6.0;

// Position of the light source
const vec3 LIGHT_SOURCE = normalize( vec3( -1.0, 1.0, -1.0 ) ) * 6.0;

// Uncomment to make the box transparent
//#define TRANSPARENT_BOX

// Utility function to clamp a value between 0 and 1
float saturate( in float v ) { return clamp( v, 0.0, 1.0 ); }

// Utility function to calculate the dot product of a vector with itself
float dot2( in vec3 v ) { return dot( v, v ); }

// Smoothly transitions the color at the edges of the box
// Returns the distance to the closest edge, with 0 being far enough and 1.0 being at the edge
float smooth_box_edge( in vec3 ro )
{
  // Calculate the smooth transition at the edges
  vec3 edge_blur = smoothstep
  (
    BOX_DTE - vec3( 0.02 ), // Start of the transition
    BOX_DTE, // End of the transition
    vec3( length( ro.xz ), length( ro.xy ), length( ro.yz ) ) // Current position
  );

  // Return the maximum blur value for the edges
  return max( edge_blur.x, max( edge_blur.y, edge_blur.z ) );
}

// Returns the distance to the plane, or -1 if the ray is parallel to the plane
float raytrace_plane
(
  in vec3 ro, // Ray origin
  in vec3 rd, // Ray direction
  in vec3 normal, // Normal of the plane
  in vec3 p0 // Any point on the plane
)
{
  // Calculate the dot product of the ray direction and the plane normal
  float RdotN = dot( rd, normal );

  // If the dot product is zero, the ray is parallel to the plane
  if ( RdotN == 0.0 ) { return -1.0; }

  // Calculate the distance to the plane
  float t = dot( ( p0 - ro ), normal ) / RdotN;
  return t;
}

// Returns a vec2 with distances to the front and back hit points, or -1 if no intersection
vec2 raytrace_sphere( in vec3 ro, in vec3 rd, in vec3 ce, in float ra )
{
  // Calculate the vector from the ray origin to the sphere center
  vec3 oc = ro - ce;

  // Calculate the coefficients of the quadratic equation
  float b = dot( oc, rd );
  float c = dot( oc, oc ) - ra * ra;
  float h = b * b - c;

  // If the discriminant is negative, there is no intersection
  if ( h < 0.0 ) { return vec2( -1.0 ); }

  // Calculate the square root of the discriminant
  h = sqrt( h );

  // Return the distances to the front and back hit points
  return vec2( -b - h, -b + h );
}


// Based on the `entering` parameters, returns the distance to the front or back of the box, and sets the normal at the hit point
float raytrace_box
(
  in vec3 ro, // Ray origin
  in vec3 rd, // Ray direction
  out vec3 normal, // Normal at the hit point
  in vec3 box_dimension, // Dimensions of the box
  in bool entering // Whether the ray is entering the box
) 
{
  // Having an equation ro + t * rd, we calculate an intersection `t` with 3 planes : xy, xz, and yz.
  // we calculate `t`, such that our ray hits the planes xy, xz, yz.
  // The result for each plane is stored in z, y, x coordinates of the `t` variable respectively.
  vec3 dr = 1.0 / rd;
  vec3 t = ro * dr;
  // Now we need to offset the `t` to hit the planes that form the box.
  // If we take a point at the corner of the box and calculate the distance needed to travel from that corner
  // to all three planes, we can then take that distance and subtract from or add to our `t`, to get the proper hit value.
  vec3 dt = box_dimension * abs( dr );
  
  // Planes facing us are closer, so we need to subtruct
  vec3 pin = - dt - t;
  // Planes behind the front planes are farther, so we need to add
  vec3 pout =  dt - t;

  // Find the maximum distance to the front face and the minimum distance to the back face
  float tin = max( pin.x, max( pin.y, pin.z ) );
  float tout = min( pout.x, min( pout.y, pout.z ) );

  // If the ray is outside of the box, return -1
  if( tin > tout )
  { 
    return -1.0;
  }

  // Calculate the normal at the hit point
  if( entering )
  {
    normal = -sign( rd ) * step( pin.zxy, pin.xyz ) * step( pin.yzx, pin.xyz );
  } 
  else 
  {
    normal = sign ( rd ) * step( pout.xyz, pout.zxy ) * step( pout.xyz, pout.yzx );
  }

  // Return the distance to the front or back of the box
  return entering ? tin : tout;
}


// Fresnel equation using Schlick's approximation
// Calculates the amount of light reflected for each color channel
vec3 fresnel( in vec3 view_dir, in vec3 halfway, in vec3 f0, in float critical_angle_cosine )
{
  // Calculate the dot product of the view direction and the halfway vector
  float VdotH = dot( view_dir, halfway );

  // If the dot product is less than the critical angle cosine, return full reflection
  if ( VdotH < critical_angle_cosine )
  {
    return vec3( 1.0 );
  }

  // Calculate the Fresnel reflectance using Schlick's approximation
  return f0 + ( 1.0 - f0 ) * pow( ( 1.0 - VdotH ), 5.0 );
}

// 3D rotation matrix around the Z axis
mat3 rotz( in float angle )
{
  // Calculate the sine and cosine of the angle
  float s = sin( angle );
  float c = cos( angle );

  // Return the rotation matrix
  return mat3
  (
    c, s, 0.0,
    -s, c, 0.0,
    0.0, 0.0, 1.0
  );
}

// 3D rotation matrix around the X axis
mat3 rotx( in float angle )
{
  // Calculate the sine and cosine of the angle
  float s = sin( angle );
  float c = cos( angle );

  // Return the rotation matrix
  return mat3
  (
    1.0, 0.0, 0.0,
    0.0, c, s,
    0.0, -s, c
  );
}

// 3D rotation matrix around the Y axis
mat3 roty( in float angle )
{
  // Calculate the sine and cosine of the angle
  float s = sin( angle );
  float c = cos( angle );

  // Return the rotation matrix
  return mat3
  (
    c, 0.0, -s,
    0.0, 1.0, 0.0,
    s, 0.0, c
  );
}

// Simple 2D to 1D hash function
float hash2dx1d( in vec2 p )
{
  // Calculate a hash value based on the input vector
  float h = dot( p, vec2( 127.1, 311.7 ) );

  // Return the fractional part of the sine of the hash value
  return fract( sin( h ) * 43758.5453123 );
}

// Simple 2D to 2D hash function
vec2 hash2dx2d( in vec2 uv )
{
  // Define transformation matrices for hashing
  mat2 transform1 = mat2( -199.258, 457.1819, -1111.1895, 2244.185 );
  mat2 transform2 = mat2( 111.415, -184.0, -2051.0, 505.0 );

  // Return the fractional part of the transformed sine of the input vector
  return fract( transform1 * sin( transform2 * uv ) );
}

// One-dimensional variation of Perlin noise
float perlin_noise2dx1d( in vec2 p )
{
  // Calculate the integer and fractional parts of the input vector
  vec2 i = floor( p );
  vec2 f = fract( p );

  // Smooth the fractional part
  vec2 u = smoothstep( vec2( 0.0 ), vec2( 1.0 ), f );

  // Calculate the noise value by interpolating between hash values
  float noise = mix
  (
    mix( hash2dx1d( i + vec2( 0.0, 0.0 ) ), hash2dx1d( i + vec2( 1.0, 0.0 ) ), u.x ),
    mix( hash2dx1d( i + vec2( 0.0, 1.0 ) ), hash2dx1d( i + vec2( 1.0, 1.0 ) ), u.x ), 
    u.y
  );

  // Return the noise value scaled to the range [-1, 1]
  return noise * 2.0 - 1.0;
}

// Remaps a value from one range to another
// Example: 0.0 in the range [-1.0, 1.0] will be 0.5 in the range [0.0, 1.0]
float remap
(
  in float t_min_in, // Minimum input range
  in float t_max_in, // Maximum input range
  in float t_min_out, // Minimum output range
  in float t_max_out, // Maximum output range
  in float v // Value to remap
)
{
  // Calculate the interpolation factor
  float k = ( v - t_min_in ) / ( t_max_in - t_min_in );

  // Return the remapped value
  return mix( t_min_out, t_max_out, k );
}

// Calculates the shadow for one of the box's faces
float seg_shadow( in vec3 ro, in vec3 rd, in vec3 pa, in float sh )
{
  // Calculate coefficients for shadow calculation
  float k1 = 1.0 - rd.x * rd.x;
  float k4 = ( ro.x - pa.x ) * k1;
  float k6 = ( ro.x + pa.x ) * k1;
  vec2 k5 = ro.yz * k1;
  vec2 k7 = pa.yz * k1;
  float k2 = -dot( ro.yz, rd.yz );
  vec2 k3 = pa.yz * rd.yz;

  // Iterate over possible shadow segments
  for ( int i = 0; i < 4; i++ )
  {
    // Calculate the shadow segment
    vec2 ss = vec2( i & 1, i >> 1 ) * 2.0 - 1.0;
    float thx = k2 + dot( ss, k3 );

    // If the segment is behind, continue to the next iteration
    if ( thx < 0.0 ) { continue; }

    // Calculate the shadow value
    float thy = clamp( -rd.x * thx, k4, k6 );
    sh = min( sh, dot2( vec3( thy, k5 - k7 * ss ) + rd * thx ) / ( thx * thx ) );
  }

  // Return the shadow value
  return sh;
}

// Returns how much the point `ro` is in the shadow
float box_soft_shadow
(
  in vec3 ro,  // Ray origin
  in vec3 rd,  // Direction to the light source
  in vec3 rad, // Box semi-size
  in float sk  // Softness of the shadow
)
{
  // Calculate the inverse of the ray direction
  vec3 m = 1.0 / rd;

  // Calculate the intersection distances with the planes
  vec3 n = m * ro;
  vec3 k = abs( m ) * rad;
  vec3 t1 = -n - k;
  vec3 t2 = -n + k;

  // Find the maximum distance to the front face and the minimum distance to the back face
  float tN = max( max( t1.x, t1.y ), t1.z );
  float tF = min( min( t2.x, t2.y ), t2.z );

  // If the ray is outside of the box, calculate the shadow
  if ( tN > tF || tF < 0.0 )
  {
    float sh = 1.0;
    sh = seg_shadow( ro.xyz, rd.xyz, rad.xyz, sh );
    sh = seg_shadow( ro.yzx, rd.yzx, rad.yzx, sh );
    sh = seg_shadow( ro.zxy, rd.zxy, rad.zxy, sh );

    // Return the smooth shadow value
    return smoothstep( 0.0, 1.0, sk * sqrt( sh ) );
  }

  // Return no shadow
  return 0.0;
}

// Base noise function for water simulation
float water_octave( in vec2 uv, in float choppy )
{
  // Offset the UV coordinates by the noise value
  uv += perlin_noise2dx1d( uv );

  // Calculate the sine and cosine waves
  vec2 s_wave = 1.0 - abs( sin( uv ) );
  vec2 c_wave = abs( cos( uv ) );

  // Mix the sine and cosine waves
  s_wave = mix( s_wave, c_wave, s_wave );

  // Return the water octave value
  return pow( 1.0 - pow( s_wave.x * s_wave.y, 0.65 ), choppy );
}

// Fractal Brownian Motion (FBM) for water noise
float water_noise( in vec2 p )
{
  // Initialize frequency, amplitude, and choppiness
  float freq = 0.16;
  float amp = 0.6;
  float choppy = 4.0;

  // Define the octave transformation matrix
  mat2 octave_m = mat2( 1.6, 1.2, -1.2, 1.6 );

  // Scale the x-coordinate of the input vector
  p.x *= 0.75;

  // Initialize the noise value
  float h = 0.0;

  // Iterate over the octaves
  for ( int i = 0; i < 5; i++ )
  {
    // Calculate the noise value for the current octave
    float d = water_octave( ( p + iTime / 2.0 ) * freq, choppy ) + water_octave( ( p - iTime / 2.0 ) * freq, choppy );

    // Accumulate the noise value
    h += d * amp;

    // Transform the input vector for the next octave
    p *= octave_m;

    // Update the frequency, amplitude, and choppiness
    freq *= 1.9;
    amp *= 0.22;
    choppy = mix( choppy, 1.0, 0.2 );
  }

  // Return the accumulated noise value
  return h;
}

// Calculates the normal of the `water_noise` at `p` position
vec3 water_normal( in vec2 p )
{
  // Define a small offset for numerical differentiation
  float e = 0.01;
  vec2 offset = vec2( 1.0, 0.0 ) * e;

  // Calculate the partial derivatives of the noise function
  float dfdx = ( water_noise( p + offset.xy ) - water_noise( p - offset.xy ) );
  float dfdz = ( water_noise( p + offset.yx ) - water_noise( p - offset.yx ) );

  // Calculate the normal vector
  vec3 normal = normalize( vec3( -dfdx, e / WATER_INTENSITY, -dfdz ) );

  // Return the normal vector
  return normal;
}

// Signed Distance Function (SDF) for a torus
float sdf_torus( in vec3 p, in vec3 t )
{
  // Calculate the horizontal distance to the torus
  vec2 q = vec2( length( p.xz ) - t.x, p.y );

  // Return the signed distance to the torus
  return max( length( q ) - t.y, abs( p.y ) - t.z );
}

// Generates spiral noise for nebula effect
float spiral_noise( in vec3 p )
{
  // Initialize the noise value and iteration factor
  float n = 0.0;
  float iter = 2.0;

  // Define the nudge factor and normalizer
  float nudge = 0.9;
  float normalizer = 1.0 / sqrt( 1.0 + nudge * nudge );

  // Iterate over the noise layers
  for ( int i = 0; i < 8; i++ )
  {
    // Accumulate the noise value
    n += abs( sin( p.y * iter ) + cos( p.x * iter ) ) / iter;

    // Rotate the input vector around the Z axis
    p.xy += vec2( p.y, -p.x ) * nudge;
    p.xy *= normalizer;

    // Rotate the input vector around the Y axis
    p.xz += vec2( p.z, -p.x ) * nudge;
    p.xz *= normalizer;

    // Update the iteration factor
    iter *= 1.733733;
  }

  // Return the accumulated noise value
  return n;
}

// Generates nebula noise based on spiral noise and torus SDF
float nebula_noise( in vec3 p )
{
  // Calculate the spiral noise value
  float result = spiral_noise( p.zxy * 0.5123 + 100.0 ) * 3.0;

  // Subtract the torus SDF value
  result -= sdf_torus( p, vec3( 2.0, 1.8, 1.25 ) );

  // Return the nebula noise value
  return result;
}

// Determines the color of the nebula based on density and distance from the center
vec3 nebula_color( in float density, in float radius )
{
  // Calculate the base color based on density
  vec3 result = mix( vec3( 1.0 ), vec3( 0.5 ), density );

  // Define the colors for the center and edge of the nebula
  vec3 col_center = 7.0 * vec3( 0.8, 1.0, 1.0 );
  vec3 col_edge = 1.5 * vec3( 0.48, 0.53, 0.5 );

  // Mix the center and edge colors based on the radius
  result *= mix( col_center, col_edge, min( ( radius + 0.05 ) / 0.9, 1.15 ) );

  // Return the nebula color
  return result;
}

// Background color
vec3 bgcol( in vec3 rd )
{
  // Mix the background colors based on the ray direction
  return mix
  (
    vec3( 0.01 ), // Dark color
    vec3( 0.336, 0.458, 0.668 ), // Light color
    smoothstep( 1.0, 0.0, abs( rd.y ) ) // Transition based on the y-component of the ray direction
  );
}

// Draws the background of the scene
vec3 draw_background
(
  in vec3 ro, // Ray origin
  in vec3 rd // Ray direction
)
{
  // Initialize the final color
  vec3 final_color = vec3( 0.0 );

  // Define the size and blur radius of the plane
  float plane_size = 12.0;
  float blur_radius = 10.0;

  // Define the normal and point on the plane
  vec3 plane_normal = vec3( 0.0, 1.0, 0.0 );
  vec3 p0 = PLANE_P;

  // Set the initial background color
  final_color = bgcol( rd );

  // Calculate the intersection distance with the plane
  float plane_t = raytrace_plane( ro, rd, plane_normal, p0 );

  // If the ray intersects the plane
  if ( plane_t > 0.0 )
  {
    // Calculate the hit point on the plane
    vec3 plane_hit = ro + plane_t * rd;

    // Calculate the UV coordinates on the plane
    vec2 uv = abs( plane_hit.xz );

    // If the hit point is within the plane size
    if ( all( lessThanEqual( uv, vec2( plane_size ) ) ) )
    {
      // Calculate the distance to the light source
      float r = length( LIGHT_SOURCE - plane_hit );

      // Calculate the attenuation of the light
      float attenuation = LIGHT_POWER / ( r * r );

      // Calculate the direction to the light source
      vec3 light_dir = normalize( LIGHT_SOURCE - plane_hit );

      // Calculate the dot product of the light direction and the plane normal
      float LdotN = saturate( dot( light_dir, plane_normal ) );

      // Calculate the half vector between the view direction and the light direction
      vec3 H = normalize( light_dir - rd );

      // Calculate the Phong reflection value
      float phong_value = pow( saturate( dot( plane_normal, H ) ), 16.0 ) * 0.1;

      // Define the diffuse color of the plane
      vec3 diff_color = vec3( 1.0 );

      // Calculate the plane color with lighting
      vec3 plane_color = ( LdotN * diff_color + phong_value );

      // Apply the attenuation to the plane color
      plane_color *= attenuation;

      // Calculate the shadow value
      float shad = box_soft_shadow( plane_hit, normalize( LIGHT_SOURCE - plane_hit ), BOX_DIMENSIONS, 2.0 );

      // Apply the shadow to the plane color
      plane_color *= smoothstep( -0.2, 1.0, shad );

      // Mix the plane color with the final color based on the blur radius
      final_color = mix
      (
        plane_color,
        final_color,
        smoothstep
        (
          blur_radius - 1.5,
          blur_radius,
          length( uv )
        )
      );
    }
  }

  // Enhance the darker parts of the final color
  return pow( final_color, vec3( 1.0 / 2.2 ) );
}

// Draws the nebula effect inside the box
vec3 draw_nebula( in vec3 ro, in vec3 rd )
{
  // Initialize the final color
  vec4 final_color = vec4( 0.0 );

  // Define the radius and maximum density of the nebula
  float radius = 6.0;
  float h = 0.1;

  // Define the optimal radius and scale factor
  float optimal_radius = 3.0;
  float k = optimal_radius / radius;

  // Initialize variables for density calculation
  vec3 p;
  float local_density = 0.0;
  float total_density = 0.0;
  float weight = 0.0;

  // Calculate the intersection distances with the nebula sphere
  vec2 vt = raytrace_sphere( ro, rd, vec3( 0.0 ), radius );

  // Get the intersection points when entering and exiting the sphere
  float tin = vt.x;
  float tout = vt.y;

  // Set the initial distance to the maximum of the entry point and zero
  float t = max( tin, 0.0 );

  // If the ray intersects the sphere
  if ( any( notEqual( vt, vec2( -1.0 ) ) ) )
  {
    // Iterate over the steps inside the sphere
    for ( int i = 0; i < 64; i++ )
    {
      // If the total density exceeds a threshold or the distance exceeds the exit point, break the loop
      if ( total_density > 0.9 || t > tout ) { break; }

      // Calculate the current position inside the sphere
      p = ro + t * rd;
      p *= k;

      // Calculate the density at the current position
      float d = abs( nebula_noise( p * 3.0 ) * 0.5 ) + 0.07;

      // Calculate the distance to the light source
      float ls_dst = max( length( p ), 0.001 );

      // Calculate the color of the bloom
      float _T = ls_dst * 2.3 + 2.6;
      vec3 light_color = 0.4 + 0.5 * cos( _T - iTime + PI * 0.5 * vec3( -0.5, 0.15, 0.5 ) );

      // Add the star color to the final color
      final_color.rgb += vec3( 0.67, 0.75, 1.0 ) / ( ls_dst * ls_dst * 10.0 ) / 80.0;

      // Add the star's bloom to the final color
      final_color.rgb += light_color / exp( ls_dst * ls_dst * ls_dst * 0.08 ) / 30.0;

      // If the density is below the threshold
      if ( d < h )
      {
        // Calculate the local density
        local_density = h - d;

        // Calculate the weighting factor
        weight = ( 1.0 - total_density ) * local_density;

        // Accumulate the total density
        total_density += weight * weight * 8.0 + 1.0 / 200.0;

        // Calculate the color of the nebula
        vec4 col = vec4( nebula_color( total_density, ls_dst ), total_density );

        // Add emission to the final color
        final_color.rgb += final_color.a * final_color.rgb * 0.2;

        // Scale the alpha value
        col.a *= 0.2;

        // Scale the color by the alpha value
        col.rgb *= col.a;

        // Blend the color into the final color
        final_color = final_color + col * ( 1.0 - final_color.a );
      }

      // Increment the total density
      total_density += 1.0 / 70.0;

      // Optimize the step size based on the density and distance
      t += max( d * 0.1 * max( min( ls_dst, length( ro * k ) ), 1.0 ), 0.01 ) / k;
    }
  }

  // Apply simple scattering to the final color
  final_color *= 1.0 / exp( total_density * 0.2 ) * 0.8;

  // Return the final color with smoothstep applied
  return smoothstep( vec3( 0.0 ), vec3( 1.0 ), final_color.rgb );
}

// Generates stars in the background based on UV coordinates
vec3 generate_stars
(
  in vec2 uv, // UV coordinates
  in float grid_size, // Size of the grid
  in float star_size, // Size of the stars
  in float flares_width, // Width of the flares
  in bool with_flare // Whether to include flares
)
{
  // Scale the UV coordinates by the grid size
  uv *= grid_size;

  // Calculate the cell ID and coordinates within the cell
  vec2 cell_id = floor( uv );
  vec2 cell_coords = fract( uv ) - 0.5;

  // Calculate the star coordinates using a hash function
  vec2 star_coords = hash2dx2d( cell_id ) - 0.5;

  // Adjust the star coordinates to fit within the cell
  star_coords -= sign( star_coords ) * max( vec2( star_size ) - vec2( 0.5 ) + abs( star_coords ), vec2( 0.0 ) );

  // Calculate the vector from the cell center to the star center
  vec2 delta_coords = abs( star_coords - cell_coords );

  // Calculate the distance to the star from the cell center
  float dist = length( delta_coords );

  // Calculate the glow of the star
  vec3 glow = vec3( exp( -5.0 * length( dist ) / ( star_size * 2.0 ) ) );

  // Calculate the brightness of the star
  float brightness = remap( 0.0, 1.0, 0.5, 1.0, hash2dx1d( cell_id ) );

  // If flares are included
  if ( with_flare )
  {
    // Animate the flare
    float flare_change = remap( -1.0, 1.0, 0.5, 1.0, sin( iTime * 3.0 + uv.x * uv.y ) );

    // Calculate the flares
    float flares = smoothstep( flares_width, 0.0, delta_coords.x ) + smoothstep( flares_width, 0.0, delta_coords.y );
    flares *= smoothstep( star_size * flare_change, 0.0, dist );

    // Apply the flares to the glow
    glow = glow * flares;
  }

  // Return the final star color with brightness applied
  return glow * brightness;
}

// Draws stars in the background based on the view direction
vec3 draw_stars( in vec3 rd )
{
  // Initialize the final color
  vec3 final_color = vec3( 0.0 );

  // Calculate the latitude and longitude from the ray direction
  float phi = atan( rd.x, rd.z );
  float theta = asin( rd.y );

  // Normalize the latitude and longitude to the range [0, 1]
  vec2 normalization = vec2( 0.1591, 0.3183 );
  vec2 uv = vec2( phi, theta ) * normalization + vec2( 0.5 );

  // Define the initial grid size, star size, and flare width
  float grid_size = 10.0;
  float star_size = 0.1;
  float flares_width = 0.08 * star_size;

  // Define the star color
  vec3 star_color = vec3( 1.0 );

  // Define the change factors for star size and grid size
  float star_size_change = 0.7;
  float grid_size_change = 2.0;

  // Draw big stars with animation
  for ( int i = 0; i < 2; i++ )
  {
    final_color += generate_stars( uv, grid_size, star_size, flares_width, true );
    star_size *= star_size_change;
    grid_size *= grid_size_change;
  }

  // Draw small stars without animation
  for ( int i = 2; i < 5; i++ )
  {
    final_color += generate_stars( uv, grid_size, star_size, flares_width, false );
    star_size *= star_size_change;
    grid_size *= grid_size_change;
  }

  // Return the final star color
  return final_color;
}

// Draws the scene inside the box
vec3 draw_box_background
(
  in vec3 ro, // Ray origin
  in vec3 rd // Ray direction
)
{
  // Initialize the final color
  vec3 final_color = vec3( 0.0 );

  // Add the stars and nebula to the final color
  final_color += draw_stars( rd );
  final_color += draw_nebula( ro, rd );

  // Return the final color
  return final_color;
}

// Draws the insides of the box, including reflections and refractions
vec3 draw_insides
(
  in vec3 ro, // Ray origin
  in vec3 rd // Ray direction
)
{
  // Initialize the distance traveled and final color
  float distance_traveled = 1.0;
  vec3 final_color = vec3( 0.0 );

  // Initialize the previous ray origin and direction
  vec3 prev_ro = ro;
  vec3 prev_rd = rd;

  // Initialize the attenuation factor
  vec3 attenuation = vec3( 1.0 );

  // Iterate over the number of reflections
  for ( int i = 0; i < NUM_REFLECTIONS; i++ )
  {
    // Draw the background inside the box
    vec3 inside_color = draw_box_background( prev_ro * INNER_BOX_SCALE, prev_rd );

    // Add the inside color to the final color with attenuation
    final_color += inside_color * attenuation;

    // Calculate the normal and intersection distance with the box
    vec3 box_normal;
    float box_t = raytrace_box( prev_ro, prev_rd, box_normal, BOX_DIMENSIONS, false );

    // Calculate the new ray origin
    vec3 new_ro = prev_ro + box_t * prev_rd;

    // Update the distance traveled
    distance_traveled += length( prev_ro - new_ro );

    // Calculate the tangent, bitangent, and normal vectors
    vec3 w = box_normal;
    vec3 u = M.xyy * w.z - M.yyx * w.x - M.yyx * w.y;
    vec3 v = M.yxy * w.z + M.yxy * w.x - M.xyy * w.y;
    mat3 TBN = mat3( u, w, v );

    // Calculate the UV coordinates
    vec2 uv = new_ro.xy * w.z + new_ro.xz * w.y + new_ro.yz * w.x;
    uv *= INSIDES_NOISE;

    // Calculate the normal vector
    vec3 n = TBN * water_normal( uv );

    // Calculate the Fresnel reflectance
    vec3 F = fresnel( prev_rd, n, F0, CRITICAL_ANGLE_BTOA );

    // Calculate the reflected and refracted ray directions
    vec3 reflectedRD = normalize( reflect( prev_rd, -n ) );
    vec3 refractedRD = refract( prev_rd, -n, iorBtoA );

    // If the box is transparent
    #ifdef TRANSPARENT_BOX
      // If refraction occurs
      if ( length( refractedRD ) > 0.0 )
      {
        // Normalize the refracted ray direction
        vec3 refractedRD = normalize( refractedRD );

        // Calculate the Fresnel reflectance for the refracted ray
        vec3 F = fresnel( refractedRD, n, F0, CRITICAL_ANGLE_ATOB );

        // Draw the background for the refracted ray
        vec3 background_color = draw_background( new_ro, refractedRD, LIGHT_SOURCE );

        // Add the background color to the final color with attenuation
        final_color += ( 1.0 - F ) * background_color * exp( -distance_traveled * 1.0 * vec3( 1.0 - COLOR_ABSORPTION ) ) * attenuation;
      }

      // Calculate the edge transition value
      float edge_t = smooth_box_edge( new_ro );

      // Mix the final color with the edge color
      vec3 edge_color = mix( final_color, BOX_EDGE_COLOR, edge_t );
      final_color = mix( final_color, edge_color, smoothstep( 0.0, 1.0, exp( -distance_traveled / 3.0 ) ) );
    #endif

    // Update the attenuation factor
    attenuation *= F;

    // Update the previous ray origin and direction
    prev_ro = new_ro;
    prev_rd = reflectedRD;
  }

  // Return the final color
  return final_color;
}

// Main function to render the scene
void mainImage( out vec4 fragColor, in vec2 fragCoord )
{
  // Calculate the UV coordinates from the mouse position
  vec2 uv = ( iMouse.xy ) / iResolution.xy;
  uv.x = 1.0 - uv.x;
  uv.y = remap( 0.0, 1.0, -0.2, 1.0, uv.y );
  uv *= vec2( PI * 2.0, PI / 2.0 );

  // Calculate the camera's origin based on the spherical coordinates
  vec3 ro = vec3( sin( uv.x ) * cos( uv.y ), sin( uv.y ), cos( uv.x ) * cos( uv.y ) ) * 2.5;

  // Animate the camera's rotation around the Y axis
  ro = roty( -iTime / 4.0 ) * ro;

  // Calculate the view direction and up vector
  vec3 view_dir = normalize( -ro );
  vec3 up = vec3( 0.0, 1.0, 0.0 );

  // Calculate the orthonormal vectors of the view transformation
  vec3 vz = normalize( view_dir );
  vec3 vy = normalize( up );
  vec3 vx = normalize( cross( vz, vy ) );
  vy = normalize( cross( vx, vz ) );
  mat3 m = mat3( vx, vy, vz );

  // Calculate the ray direction
  vec3 rd = vec3( ( fragCoord * 2.0 - iResolution.xy ) / iResolution.x, 0.7 );
  rd = normalize( m * rd );

  // Initialize the final color
  vec3 final_color = vec3( 0.0 );

  // Draw the background
  final_color = draw_background( ro, rd );

  // Calculate the normal and intersection distance with the box
  vec3 box_normal;
  float box_t = raytrace_box( ro, rd, box_normal, BOX_DIMENSIONS, true );

  // If the ray intersects the box
  if ( box_t > 0.0 )
  {
    // Reset the final color
    final_color = vec3( 0.0 );

    // Calculate the intersection point with the box
    vec3 ro = ro + box_t * rd;

    // Calculate the tangent, bitangent, and normal vectors
    vec3 w = box_normal;
    vec3 u = normalize( M.xyy * w.z - M.yyx * w.x - M.yyx * w.y );
    vec3 v = normalize( M.yxy * w.z + M.yxy * w.x - M.xyy * w.y );
    mat3 TBN = mat3( u, w, v );

    // Calculate the UV coordinates
    vec2 uv = ro.xy * w.z + ro.xz * w.y + ro.yz * w.x;
    uv *= INSIDES_NOISE;

    // Calculate the normal vector
    vec3 n = normalize( TBN * water_normal( uv ) );

    // Calculate the Fresnel reflectance
    vec3 F = fresnel( -rd, n, F0, CRITICAL_ANGLE_ATOB );

    // Calculate the refracted and reflected ray directions
    vec3 refractedRD = refract( rd, n, iorAtoB );
    vec3 reflectedRD = normalize( reflect( rd, n ) );

    // If ray was reflected towards the box
    if( dot( reflectedRD, box_normal ) <= 0.0 )
    {
      // Reflect the ray against the box's normal.
      reflectedRD = normalize( reflect( reflectedRD, box_normal ) );
    }

    // If refraction occurs
    if ( length( refractedRD ) > 0.0 )
    {
      // Normalize the refracted ray direction
      refractedRD = normalize( refractedRD );

      // Draw the insides of the box for the refracted ray
      vec3 insides_color = draw_insides( ro, refractedRD );

      // Add the insides color to the final color
      final_color += ( 1.0 - F ) * insides_color;
    }

    // Draw the background for the reflected ray
    vec3 refl_color = draw_background( ro, reflectedRD );

    // Add the reflected color to the final color
    final_color += F * refl_color;

    // Calculate the edge transition value
    float edge_t = smooth_box_edge( ro );

    // Mix the final color with the edge color
    final_color = mix( final_color, BOX_EDGE_COLOR, edge_t );
  }

  // Set the fragment color to the final color with full opacity
  fragColor = vec4( final_color, 1.0 );
}

