
//precision highp float;

const float PI =3.14159265;
// Refractive index of the air
const float airRI = 1.0;
// Refractive index of the box( water )
const float boxRI = 1.33;
// Index of refraction Air to Box
const float iorAtoB = airRI / boxRI;
// Index of refraction Box to Air
const float iorBtoA = boxRI / airRI;
// Fresnel value at 0 degrees incidence
const vec3 F0 = vec3( pow( abs( ( boxRI - airRI ) ) / ( boxRI + airRI ), 2.0 ) );
const vec3 COLOR_ABSORPTION = vec3( 0.9 );
// Drawing Nebula is quite expensive, so be careful with the amount of reflections
const int NUM_REFLECTIONS = 2;
const vec3 BOX_DIMENSIONS = vec3( 0.75, 1.25, 0.75 );
// Distance to the edges
const vec3 BOX_DTE = vec3( length( BOX_DIMENSIONS.xz ), length( BOX_DIMENSIONS.xy ), length( BOX_DIMENSIONS.yz ) );
// Angles of full reflections given IOR for the pair of mediums
const float CRITICAL_ANGLE_ATOB = sqrt( max( 0.0, 1.0 - iorBtoA * iorBtoA ) );
const float CRITICAL_ANGLE_BTOA = sqrt( max( 0.0, 1.0 - iorAtoB * iorAtoB ) );
const float LIGHT_POWER = 15.0;
const vec3 BOX_EDGE_COLOR = vec3( 0.0 );
// A point on a plane
const vec3 PLANE_P = vec3( 0.0, -BOX_DIMENSIONS.y - 0.001, 0.0 );
// A constant to us as a shotycur when creating vectors: M.xyy, M.yyx, etc...
const vec2 M = vec2( 1.0, 0.0 );
// Noise scale on the box's faces
const float INSIDES_NOISE = 0.3;
// Intensity of the waves on the box's faces
const float WATER_INTENSITY = 0.5;
// The size of the box on the inside
const float INNER_BOX_SCALE = 6.0;
const vec3 LIGHT_SOURCE = normalize( vec3( -1.0, 1.0, -1.0 ) ) * 6.0;

// Uncomment to make the box transparent
//#define TRANSPARENT_BOX

float saturate( in float v ) { return clamp( v, 0.0, 1.0 ); }
float dot2( in vec3 v ) { return dot( v, v ); }

// Paint the edges in black with a little blur at transition
// Returns the distance to the closest edge. 0 being far enougn, 1.0 being at the edge
float smooth_box_edge( in vec3 ro )
{
  vec3 edge_blur = smoothstep
  ( 
    BOX_DTE - vec3( 0.02 ), 
    BOX_DTE, 
    vec3( length( ro.xz ), length( ro.xy ), length( ro.yz ) ) 
  );

  return max( edge_blur.x, max( edge_blur.y, edge_blur.z ) );
}

// Returns the distance to the plane from `ro` in `rd` direction
float raytrace_plane
( 
  in vec3 ro, // Ray origin
  in vec3 rd, // Ray direction
  in vec3 normal, // Normal of the plane
  in vec3 p0 // Any point on the plane
)
{
  // If this equals 0.0, then the line is parallel to the plane
  float RdotN = dot( rd, normal );
  if( RdotN == 0.0 ) { return -1.0; }

  float t = dot( ( p0 - ro ), normal ) / RdotN;
  return t;
}

// Returns the distance from `ro` to `rd` to the hit points on the front and on the back.
vec2 raytrace_sphere( in vec3 ro, in vec3 rd, in vec3 ce, in float ra )
{
  vec3 oc = ro - ce;
  float b = dot( oc, rd );
  float c = dot( oc, oc ) - ra * ra;
  float h = b * b - c;
  if( h < 0.0 ) { return vec2( -1.0 ); } // no intersection
  h = sqrt( h );
  return vec2( -b - h, -b + h );
}

// Based on the `entering` parameters, returns a distance to the front/back of the box from `ro` in `rd` direction
float raytrace_box
(
  in vec3 ro, 
  in vec3 rd, 
  out vec3 normal, // Normal at the hit point
  in vec3 box_dimension,
  in bool entering
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

  // From the distances to all the front and back faces, we find faces of the box that are actually hit by the ray
  float tin = max( pin.x, max( pin.y, pin.z ) );
  float tout = min( pout.x, min( pout.y, pout.z ) );

  // Ray is outside of the box
  if( tin > tout )
  { 
    return -1.0;
  }

  // Calculate the normal
  if( entering )
  {
    normal = -sign( rd ) * step( pin.zxy, pin.xyz ) * step( pin.yzx, pin.xyz );
  } 
  else 
  {
    normal = sign (rd ) * step( pout.xyz, pout.zxy ) * step( pout.xyz, pout.yzx );
  }

  return entering ? tin : tout;
}


//
// Different utilities
//

// Schlick version of the Fresnel equation
// Calculates the amount of light reflected, seperately for each color channel.
vec3 fresnel( in vec3 view_dir, in  vec3 halfway, in vec3 f0, in float critical_angle_cosine )
{
  float VdotH = dot( view_dir, halfway );
  // Case of full reflection
  if( VdotH < critical_angle_cosine ) 
  {
    return vec3( 1.0 );
  }

  return f0 + ( 1.0 - f0 ) * pow( ( 1.0 - VdotH ), 5.0 );
}

// 3D rotation matrix around the Z axis
mat3 rotz( in float angle )
{
  float s = sin( angle );
  float c = cos( angle );
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
  float s = sin( angle );
  float c = cos( angle );
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
  float s = sin( angle );
  float c = cos( angle );
  return mat3
  (
    c, 0.0, -s,
    0.0, 1.0, 0.0,
    s, 0.0, c
  );
}

// Simple 2D -> 1D hash
float hash2dx1d( in vec2 p ) 
{
	float h = dot( p, vec2( 127.1,311.7 ) );	
  return fract( sin( h ) * 43758.5453123 );
}

// Simple 2D -> 2D hash
vec2 hash2dx2d( in vec2 uv ) 
{
  mat2 transform1 = mat2( -199.258, 457.1819, -1111.1895, 2244.185 );
  mat2 transform2 = mat2( 111.415, -184.0, -2051.0, 505.0 );
  return fract( transform1 * sin( transform2 * uv ) );
}

// One-dimensional variation of Perlin noise
float perlin_noise2dx1d( in vec2 p )
{
  vec2 i = floor( p );
  vec2 f = fract( p );	
	vec2 u = smoothstep( vec2( 0.0 ), vec2( 1.0 ), f );

  float noise = mix( mix( hash2dx1d( i + vec2( 0.0,0.0 ) ), 
                          hash2dx1d( i + vec2( 1.0,0.0 ) ), u.x ),
                     mix( hash2dx1d( i + vec2( 0.0,1.0 ) ), 
                          hash2dx1d( i + vec2( 1.0,1.0 ) ), u.x ), u.y );

  return noise * 2.0 - 1.0;
}

// Convert a value in the range [ t_min_in, t_max_in ] to a value in the range [ t_min_out, t_max_out ]
// Example: 0.0 in the range [ -1.0, 1.0 ] will be 0.5 in the range [ 0.0, 1.0 ]
float remap
( 
  in float t_min_in, 
  in float t_max_in, 
  in float t_min_out, 
  in float t_max_out, 
  in float v 
)
{
  float k = ( v - t_min_in ) / ( t_max_in - t_min_in );
  return mix( t_min_out, t_max_out, k );
}

// Calculates the shadow for one of the box's faces. Is us
float seg_shadow( in vec3 ro, in vec3 rd, in vec3 pa, in float sh )
{
  float k1 = 1.0 - rd.x * rd.x;
  float k4 = ( ro.x - pa.x ) * k1;
  float k6 = ( ro.x + pa.x ) * k1;
  vec2 k5 = ro.yz * k1;
  vec2 k7 = pa.yz * k1;
  float k2 = -dot( ro.yz, rd.yz );
  vec2 k3 = pa.yz * rd.yz;
  
  for( int i = 0; i < 4; i++ )
  {
    vec2 ss = vec2( i & 1, i >> 1 ) * 2.0 - 1.0;
    float thx = k2 + dot( ss, k3 );
    if( thx < 0.0 ) { continue; } // behind
    float thy = clamp( -rd.x * thx, k4, k6 );
    sh = min( sh, dot2( vec3( thy, k5 - k7 * ss ) + rd * thx ) / ( thx * thx ) );
  }
  return sh;
}

// Returns how much the point `ro` is in the shadow
float box_soft_shadow
( 
  in vec3 ro,  // Ray origin
  in vec3 rd,  // Direction to the light source
  in vec3 rad, // box semi-size
  in float sk  // softness of the shadow
) 
{
  vec3 m = 1.0 / rd;
  vec3 n = m * ro;
  vec3 k = abs( m ) * rad;
  vec3 t1 = -n - k;
  vec3 t2 = -n + k;

  float tN = max( max( t1.x, t1.y ), t1.z );
  float tF = min( min( t2.x, t2.y ), t2.z );

  if( tN > tF || tF < 0.0 )
  {
    float sh = 1.0;
    sh = seg_shadow( ro.xyz, rd.xyz, rad.xyz, sh );
    sh = seg_shadow( ro.yzx, rd.yzx, rad.yzx, sh );
    sh = seg_shadow( ro.zxy, rd.zxy, rad.zxy, sh );
    return smoothstep( 0.0, 1.0, sk * sqrt( sh ) );
  }
  return 0.0;
}

// The base noise for the water noise
float water_octave( in vec2 uv, in float choppy )
{
  // Offset the uv value in y = x direction by the noise value
  uv += perlin_noise2dx1d( uv );
  vec2 s_wave = 1.0 - abs( sin( uv ) );
  vec2 c_wave = abs( cos( uv ) );
  s_wave = mix( s_wave, c_wave, s_wave );
  return pow( 1.0 - pow( s_wave.x * s_wave.y, 0.65 ), choppy );
}

// FBM of the `water_octave` noise
float water_noise( in vec2 p )
{
  float freq = 0.16;
  float amp = 0.6;
  float choppy = 4.0;
  mat2 octave_m = mat2( 1.6, 1.2, -1.2, 1.6 );
  p.x *= 0.75;

  float h = 0.0;    

  for( int i = 0; i < 5; i++ ) 
  { 
    // Mix two octaves for better detail
    float d = water_octave( ( p + iTime / 2.0 ) * freq, choppy ) + water_octave( ( p - iTime / 2.0 ) * freq, choppy );
    // Add the height of the current octave to the sum
    h += d * amp;        
    // Deform p domain( rotate and stretch)
    p *= octave_m; 
    freq *= 1.9; 
    amp *= 0.22;
    choppy = mix( choppy, 1.0, 0.2 );
  }

  return h;
}

// Calculates the normal of the `water_noise` at `p` position
vec3 water_normal( in vec2 p )
{
  float e = 0.01;
  vec2 offset = vec2( 1.0, 0.0 ) * e;
  float dfdx = ( water_noise( p + offset.xy ) - water_noise( p - offset.xy ) );
  float dfdz = ( water_noise( p + offset.yx ) - water_noise( p - offset.yx ) );
  vec3 normal = normalize( vec3( -dfdx, e / WATER_INTENSITY, -dfdz ) );
  return normal;
}

// 3D Signed Distance Function of the torus
float sdf_torus( in vec3 p, in vec3 t )
{
  vec2 q = vec2( length( p.xz ) - t.x, p.y );
  return max( length( q ) - t.y, abs( p.y ) - t.z );
}

float spiral_noise( in vec3 p )
{
  float n = 0.0;	// Noise accumulator
  float iter = 2.0;
  float nudge = 0.9; // Size of perpendicular vector
  float normalizer = 1.0 / sqrt( 1.0 + nudge * nudge ); // pythagorean theorem on that perpendicular to maintain scale
  for( int i = 0; i < 8; i++ )
  {
    // Add sin and cos scaled inverse with the frequency
    n += abs( sin( p.y * iter ) + cos( p.x * iter ) ) / iter;
    // Rotate around Z axis by adding perpendicular and scaling down
    p.xy += vec2( p.y, -p.x ) * nudge;
    p.xy *= normalizer;

    // Rotate around Y axis
    p.xz += vec2( p.z, -p.x ) * nudge;
    p.xz *= normalizer;
    // Increase the frequency
    iter *= 1.733733;
  }
  return n;
}

float nebula_noise( in vec3 p )
{
  float result = spiral_noise( p.zxy * 0.5123 + 100.0 ) * 3.0;
  result -= sdf_torus( p, vec3( 2.0, 1.8, 1.25 ) );
  return result;
}

// Return the weight of each color channel based on the distance from the center and the current total density
vec3 nebula_color( in float density, in float radius )
{
  // Color based on density alone, gives impression of occlusion within the media
  vec3 result = mix( vec3( 1.0 ), vec3( 0.5 ), density );
	
  // Color added to the media
  vec3 col_center = 7.0 * vec3( 0.8, 1.0, 1.0 );
  vec3 col_edge = 1.5 * vec3( 0.48, 0.53, 0.5 );
  result *= mix( col_center, col_edge, min( ( radius + 0.05 ) / 0.9, 1.15 ) );
  return result;
}

// Background color
vec3 bgcol( in vec3 rd )
{
  return mix
  ( 
    vec3( 0.01 ), 
    vec3( 0.336, 0.458, 0.668 ), 
    smoothstep( 1.0, 0.0, abs( rd.y ) ) 
  );
}

vec3 draw_background
(
  in vec3 ro,
  in vec3 rd
)
{
  vec3 final_color = vec3( 0.0 );
  float plane_size = 12.0;
  float blur_radius = 10.0;
  vec3 plane_normal = vec3( 0.0, 1.0, 0.0 ); // Normal of the plane
  vec3 p0 = PLANE_P; // Any point on the plane
  final_color = bgcol( rd );

  float plane_t = raytrace_plane( ro, rd, plane_normal, p0 );

  if( plane_t > 0.0 )
  {
    vec3 plane_hit = ro + plane_t * rd;
    vec2 uv = abs( plane_hit.xz );
    if( all( lessThanEqual( uv, vec2( plane_size ) ) ) )
    {
      // Calculate the distance to the light source
      float r = length( LIGHT_SOURCE - plane_hit );
      // Attenuation of the light, that can be controlled by the `LIGHT_POWER` constant
      float attenuation = LIGHT_POWER / ( r * r );

      // Direction to the light source
      vec3 light_dir = normalize( LIGHT_SOURCE - plane_hit );
      // Amount of light that hits the surface
      float LdotN = saturate( dot( light_dir, plane_normal ) );
      // Half vector between the view direction and the light direction
      vec3 H = normalize( light_dir - rd );
      // Adds a specular reflection
      float phong_value = pow( saturate( dot( plane_normal, H ) ), 16.0 ) * 0.1;

      // Diffuse color of the plane
      vec3 diff_color = vec3( 1.0 );
      // Apply lighting 
      vec3 plane_color = ( LdotN * diff_color + phong_value );
      // Reduce by the attenuation
      plane_color *= attenuation; 

      float shad = box_soft_shadow( plane_hit, normalize( LIGHT_SOURCE - plane_hit ), BOX_DIMENSIONS, 2.0 );
      plane_color *= smoothstep( -0.2, 1.0, shad );

      // Radially smooth the surface of the plane
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

  // Enhance the darker parts
  return pow( final_color, vec3( 1.0 / 2.2 ) );
}

vec3 draw_nebula( in vec3 ro, in vec3 rd )
{
  vec4 final_color = vec4( 0.0 );
  // Redius of the sphere that envelops the nebula
  float radius = 6.0;
  // Max density
  float h = 0.1;
  float optimal_radius = 3.0;
  float k = optimal_radius / radius;

  // Current position as we step through the medium
  vec3 p;
  // Density at the point
  float local_density = 0.0;
  // Total accumulated density up to that point
  float total_density = 0.0;
  // Influence of the current point to the overall calculations
  float weight = 0.0;

  vec2 vt = raytrace_sphere( ro, rd, vec3( 0.0 ), radius );
  // Itersection point when entering the sphere
  float tin = vt.x;
  // Intersection point when exiting the sphere
  float tout = vt.y;
  float t = max( tin, 0.0 );

  // If sphere was hit
  if( any( notEqual( vt, vec2( -1.0 ) ) ) )
  { 
    for( int i = 0; i < 64; i++ )
    {
      if( total_density > 0.9 || t > tout ) { break; }

      // Current posititon inside the sphere
      p = ro + t * rd;
      p *= k;
      // Get the density at the current position
      float d = abs( nebula_noise( p * 3.0 ) * 0.5 ) + 0.07;

      // Distance to the light soure
      float ls_dst = max( length( p ), 0.001 ); 

      // The color of the light 
      float _T = ls_dst * 2.3 + 2.6;
      vec3 light_color = 0.4 + 0.5 * cos( _T + -iTime + PI * 0.5 * vec3( -0.5, 0.15, 0.5 ) );
      // Star in the middle
      final_color.rgb += vec3( 0.67, 0.75, 1.0 ) / ( ls_dst * ls_dst * 10.0 ) / 80.0; 
      // Star's bloom
      final_color.rgb += light_color / exp( ls_dst * ls_dst * ls_dst * 0.08 ) / 30.0;

      if( d < h )
      {
        // Compute local density 
        local_density = h - d;
        // Compute weighting factor. The more density accumulated so far, the less weigth current local density has
        weight = ( 1.0 - total_density ) * local_density;
        // Accumulate density
        total_density += weight * weight * 8.0 + 1.0 / 200.0;
        
        // Transparancy falls, as the density increases
        vec4 col = vec4( nebula_color( total_density, ls_dst ), total_density );

        // Emission. The densier the medium gets, the brighter it shines
        final_color.rgb += final_color.a * final_color.rgb * 0.2;	   
        // Uniform scale density
        col.a *= 0.2;
        // Color by alpha
        col.rgb *= col.a;
        // Alpha blend in contribution
        final_color = final_color + col * ( 1.0 - final_color.a );
      }

      total_density += 1.0 / 70.0;
      // Optimize step size near the camera and near the light source. The densier field - the bigger step
      t += max( d * 0.1 * max( min( ls_dst, length( ro * k ) ), 1.0 ), 0.01 ) / k;
    }
  }

  // Simple scattering
  final_color *= 1.0 / exp( total_density * 0.2 ) * 0.8;

  return smoothstep( vec3( 0.0 ), vec3( 1.0 ), final_color.rgb );
}

// Divides the `uv` space into a grid and generates a one star in each cell( Calculates the color based on the gragment's cell_id and cell_coords )
vec3 generate_stars
(
  in vec2 uv,
  in float grid_size,
  in float star_size,
  in float flares_width,
  in bool with_flare
)
{
  uv *= grid_size;
  vec2 cell_id = floor( uv );
  vec2 cell_coords = fract( uv ) - 0.5;
  vec2 star_coords = hash2dx2d( cell_id ) - 0.5;
  // Move the star, to have it fully fit inside the cell
  star_coords -= sign( star_coords ) * max( vec2( star_size ) - vec2( 0.5 ) + abs( star_coords ), vec2( 0.0 ) );

  // Vector from the cell's center to the star's center
  vec2 delta_coords = abs( star_coords - cell_coords );
  // Distance to the star from the cell center
  float dist = length( delta_coords );
  vec3 glow = vec3( exp( -5.0 * length( dist ) / ( star_size * 2.0 ) ) );

  float brightness = remap( 0.0, 1.0, 0.5, 1.0, hash2dx1d( cell_id ) );

  if( with_flare )
  {
    // Animate the flare
    float flare_change = remap( -1.0, 1.0, 0.5, 1.0, sin( iTime * 3.0 + uv.x * uv.y ) );
    float flares = smoothstep( flares_width, 0.0, delta_coords.x ) + smoothstep( flares_width, 0.0, delta_coords.y );
    flares *= smoothstep( star_size * flare_change, 0.0, dist );
    
    glow = glow * flares;
  }

  return glow * brightness;
}

// Draws stars on the sphere based on the view direction
vec3 draw_stars( in vec3 rd )
{
  vec3 final_color = vec3( 0.0 );

  // Latitude
  float phi = atan( rd.x, rd.z );
  // Longitute
  float theta = asin( rd.y );

  // [ 1/2PI, 1/PI ]
  vec2 normalization = vec2( 0.1591, 0.3183 );
  vec2 uv = vec2( phi, theta ) * normalization + vec2( 0.5 );
  
  float grid_size = 10.0;
  float star_size = 0.1;
  float flares_width = 0.08 * star_size;
  vec3 star_color = vec3( 1.0 );

  float star_size_change = 0.7;
  float grid_size_change = 2.0;

  // Big stars are animated
  for( int i = 0; i < 2; i++ )
  {
    final_color += generate_stars( uv, grid_size, star_size, flares_width, true );
    star_size *= star_size_change;
    grid_size *= grid_size_change;
  }

  // Small stars are not animated
  for( int i = 2; i < 5; i++ )
  {
    final_color += generate_stars( uv, grid_size, star_size, flares_width, false );
    star_size *= star_size_change;
    grid_size *= grid_size_change;
  }

  return final_color;
}

// Draws a scene within the box
vec3 draw_box_background
(
  in vec3 ro,
  in vec3 rd
)
{
  vec3 final_color = vec3( 0.0 );

  final_color += draw_stars( rd );
  final_color += draw_nebula( ro, rd );

  return final_color;
}

// Draws box's insides
vec3 draw_insides
(
  in vec3 ro,
  in vec3 rd
)
{
  float distance_traveled = 1.0;
  vec3 final_color = vec3( 0.0 );
  vec3 prev_ro = ro;
  vec3 prev_rd = rd;
  vec3 attenuation = vec3( 1.0 );
  for( int i = 0; i < NUM_REFLECTIONS; i++ )
  {
    vec3 inside_color = draw_box_background( prev_ro * INNER_BOX_SCALE, prev_rd );
    final_color += inside_color * attenuation;

    vec3 box_normal;
    float box_t = raytrace_box( prev_ro, prev_rd, box_normal, BOX_DIMENSIONS, false );

    vec3 new_ro = prev_ro + box_t * prev_rd;
    distance_traveled += length( prev_ro - new_ro );

    vec3 w = box_normal;
    vec3 u = M.xyy * w.z - M.yyx * w.x - M.yyx * w.y;
    vec3 v = M.yxy * w.z + M.yxy * w.x - M.xyy * w.y;
    mat3 TBN = mat3( u, w, v );

    vec2 uv = new_ro.xy * w.z + new_ro.xz * w.y + new_ro.yz * w.x;
    uv *= INSIDES_NOISE;

    vec3 n = TBN * water_normal( uv );

    vec3 F = fresnel( prev_rd, n, F0, CRITICAL_ANGLE_BTOA );
    vec3 reflectedRD = normalize( reflect( prev_rd, -n ) );
    vec3 refractedRD = refract( prev_rd, -n , iorBtoA );

    // Makes the box transparent
    #ifdef TRANSPARENT_BOX
      if( length( refractedRD ) > 0.0 )
      {
        vec3 refractedRD = normalize( refractedRD );
        vec3 F = fresnel( refractedRD, n, F0, CRITICAL_ANGLE_ATOB );
        vec3 background_color = draw_background( new_ro, refractedRD, LIGHT_SOURCE );
        final_color += ( 1.0 - F ) * background_color * exp( -distance_traveled * 1.0 * vec3( 1.0 - COLOR_ABSORPTION ) ) * attenuation;
      }

      float edge_t = smooth_box_edge( new_ro );
      vec3 edge_color =  mix( final_color, BOX_EDGE_COLOR, edge_t );
      final_color = mix( final_color, edge_color, smoothstep(  0.0,  1.0, exp( -distance_traveled / 3.0 ) ) );
    #endif

    attenuation *= F;
    prev_ro = new_ro;
    prev_rd = reflectedRD;
  }

  return final_color;
}

void mainImage( out vec4 fragColor, in vec2 fragCoord )
{
  // Get the spherical coordinates from the mouse's coordinates
  vec2 uv = ( iMouse.xy ) / iResolution.xy;
  uv.x = 1.0 - uv.x;
  uv.y = remap( 0.0, 1.0, -0.2, 1.0, uv.y);
  uv *= vec2( PI * 2.0, PI / 2.0 );

  // Camera's origin based on the spherical coordinates
  vec3 ro = vec3( sin( uv.x ) * cos( uv.y ), sin( uv.y ), cos( uv.x ) * cos( uv.y ) ) * 2.5;
  // Animate camera's rotation around the Y axes
  ro = roty( -iTime / 4.0 ) * ro;
  
  vec3 view_dir = normalize( -ro );
  vec3 up = vec3( 0.0, 1.0, 0.0 );

  // Orthonormal vectors of the view transformation
  vec3 vz = normalize( view_dir );
  vec3 vy = normalize( up );
  vec3 vx = normalize( cross( vz, vy ) );
  vy = normalize( cross( vx, vz ) );
  mat3 m = mat3( vx, vy, vz );

  vec3 rd = vec3( ( fragCoord * 2.0 - iResolution.xy ) / iResolution.x, 0.7 );
  rd = normalize( m * rd );

  vec3 final_color = vec3( 0.0 );

  final_color = draw_background( ro, rd );

  vec3 box_normal;
  float box_t = raytrace_box( ro, rd, box_normal, BOX_DIMENSIONS, true );

  if( box_t > 0.0 )
  {
    final_color = vec3( 0.0 );
    // Intersection point with the box
    vec3 ro = ro + box_t * rd;

    vec3 w = box_normal;
    vec3 u = normalize( M.xyy * w.z - M.yyx * w.x - M.yyx * w.y );
    vec3 v = normalize( M.yxy * w.z + M.yxy * w.x - M.xyy * w.y );
    mat3 TBN = mat3( u, w, v );

    vec2 uv = ro.xy * w.z + ro.xz * w.y + ro.yz * w.x;
    uv *= INSIDES_NOISE;

    vec3 n = normalize( TBN * water_normal( uv ) );

    vec3 F = fresnel( -rd, n, F0, CRITICAL_ANGLE_ATOB );
    vec3 refractedRD = refract( rd, n, iorAtoB );
    vec3 reflectedRD = normalize( reflect( rd, n ) );

    // If any refraction happens
    if( length( refractedRD ) > 0.0 )
    {
      refractedRD = normalize( refractedRD );
      vec3 insides_color = draw_insides( ro, refractedRD );
      final_color += ( 1.0 - F ) * insides_color;
    }

    vec3 refl_color = draw_background( ro, reflectedRD );
    final_color += F * refl_color;

    float edge_t = smooth_box_edge( ro );
    final_color = mix( final_color, BOX_EDGE_COLOR, edge_t ) ;
  }
  
  fragColor = vec4( final_color, 1.0 );
}

