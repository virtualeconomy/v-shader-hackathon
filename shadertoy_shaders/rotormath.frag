/*
 * URL: https://www.shadertoy.com/view/M3jBDW
 */

#define M u_mouse.xy
#define R u_resolution.xy
#define W R.x
#define H R.y

//

vec2 UV;
float AA;
vec4 C = vec4(0.);
float D = 0.;
float draw_width;

//

#define hangle float
#define vector vec3
/*
struct vector
{
	float x;
	float y;
	float z;
};
*/

//

struct rotor
{
	vector v;
	hangle h;
};

rotor rotor_invert( in rotor r )
{
    return rotor(
        -r.v,
        r.h
    );
}

rotor new_rotor( in vector norm_v, in hangle h )
{
	return rotor(
		norm_v * sin( h ),
		cos( h )
	);
}

rotor rotor_halve( in rotor r )
{
    return rotor(r.v * .5, r.h * .5);
}

rotor rotor_mul( in rotor a, in rotor b )
{
	float i = ( a.v.z + a.v.x ) * ( b.v.x + b.v.y );
	float j = ( a.h + a.v.y ) * ( b.h - b.v.z );
	float k = ( a.h - a.v.y ) * ( b.h + b.v.z );
	float l = i + j + k;
	float m = .5 * ( ( a.v.z - a.v.x ) * ( b.v.x - b.v.y ) + l );
	return rotor(
		vector(
			( a.h + a.v.x ) * ( b.h + b.v.x ) + m - l,
			( a.h - a.v.x ) * ( b.v.y + b.v.z ) + m - k,
			( a.v.y + a.v.z ) * ( b.h - b.v.x ) + m - j
		),
		( a.v.z - a.v.y ) * ( b.v.y - b.v.z ) + m - i
	);
}

rotor rotor_add( in rotor a, in rotor b )
{
    return rotor(
        a.v + b.v,
        a.h + b.h
    );
}

rotor yaw_pitch_roll( in hangle yaw, in hangle pitch, in hangle roll )
{
	float sy = sin( yaw );
	float cy = cos( yaw );
	float sp = sin( pitch );
	float cp = cos( pitch );
	float sr = sin( roll );
	float cr = cos( roll ); 
	return rotor(
		vec3(
			sr * cp * cy - cr * sp * sy,
			cr * sp * cy + sr * cp * sy,
			cr * cp * sy - sr * sp * cy
		),
		cr * cp * cy + sr * sp * sy
	);
}

rotor look_rotor( in vector from_v, in vector to_v, in hangle roll )
{
    vector dir = normalize( to_v - from_v );
    return yaw_pitch_roll(
        atan( dir.y, dir.x ) * .5,
        asin( -dir.z ) * .5,
        roll
    );
}

vector vector_rotate( in vector v, in rotor r )
{
    float a = r.v.y * v.z - r.v.z * v.y;
    float b = r.v.z * v.x - r.v.x * v.z;
    float c = r.v.x * v.y - r.v.y * v.x;
    return vector(
        v.x + 2. * ( r.h * a + r.v.y * c - r.v.z * b ),
        v.y + 2. * ( r.h * b + r.v.z * a - r.v.x * c ),
        v.z + 2. * ( r.h * c + r.v.x * b - r.v.y * a )
    );
}

//

struct motor
{
    rotor r;
    rotor d;
};

motor new_motor( in rotor r, in vector pos )
{
    return motor(
        r,
        rotor_halve(
            rotor_mul(
                r,
                rotor(
                    vector( pos.x, pos.y, pos.z ),
                    0.
                )
            )
        )
    );
}

motor motor_mul( in motor a, in motor b )
{
    return motor(
        rotor_mul( a.r, b.r ),
        rotor_add(
            rotor_mul( a.r, b.d ),
            rotor_mul( a.d, b.r )
        )
    );
}

vector vector_transform( in vector v, in motor m )
{
    return motor_mul(
        motor_mul(
            m,
            motor(
                rotor( vector( 0. ), 1. ),
                rotor( v, 0. )
            )
        ),
        motor(
            rotor( -m.r.v, m.r.h ),
            rotor( m.d.v, -m.d.h )
        )
    ).d.v;
}

//

struct projection
{
    float view_scale;
    float spherical;
    float sphere_scale;
};

projection new_projection( in float fov_degrees, in float spherical, in float sphere_scale )
{
    return projection(
        1. / tan(fov_degrees * .5),
        spherical,
        sphere_scale
    );
}

vector world_to_view( in vector v )
{
    return vec3( -v.y, -v.z, v.x );
}

vector vector_project( in vector world_v, in projection p )
{
    vector pos = world_to_view( world_v );
    /**/
    pos.y = -pos.y;
    /**/
    float z = ( ( 1. - p.spherical ) * pos.z ) +
        ( p.spherical * ( length( vector( pos.xy, pos.z * p.sphere_scale ) ) / p.sphere_scale ) );
    
    return vector(
        pos.x / z * p.view_scale,
        pos.y / z * p.view_scale,
        1. / z
    );
}

//

#define observer motor

observer new_observer( in vector from_v, in vector to_v, in hangle roll )
{
    return new_motor( rotor_invert( look_rotor( from_v, to_v, roll ) ), -from_v );
}

vector vector_observe( in vector world_v, in observer o, in projection p )
{
    return vector_project( vector_transform( world_v, o ), p );
}

//

void draw_line( in vector a, in vector b, vec4 c, float w) {
    float d = mix(a.z, b.z, clamp(dot(UV - a.xy, b.xy - a.xy) / dot(b.xy - a.xy, b.xy - a.xy), 0., 1.));
    if (max(0.,d) < D) return;

    vec2 v = b.xy - a.xy;
    vec2 p = UV - a.xy;
    float t = smoothstep(AA, -AA, length(p - clamp(dot(p, v) / dot(v, v), 0., 1.) * v) - w);

    D = mix(D, d, t);
    C = mix(C, c, t);
}

void draw_cube( in vector pos, in float scale, in rotor r, in observer o, in projection p, in vec4 c )
{
    float s = scale * .5;
    
    vector flu = vector_observe( pos + vector_rotate( vector( s, s, s ), r ), o, p );
    vector blu = vector_observe( pos + vector_rotate( vector( -s, s, s ), r ), o, p );
    vector bru = vector_observe( pos + vector_rotate( vector( -s, -s, s ), r ), o, p );
    vector fru = vector_observe( pos + vector_rotate( vector( s, -s, s ), r ), o, p );
    
    vector fld = vector_observe( pos + vector_rotate( vector( s, s, -s ), r ), o, p );
    vector bld = vector_observe( pos + vector_rotate( vector( -s, s, -s ), r ), o, p );
    vector brd = vector_observe( pos + vector_rotate( vector( -s, -s, -s ), r ), o, p );
    vector frd = vector_observe( pos + vector_rotate( vector( s, -s, -s ), r ), o, p );

    draw_line( flu, blu, c, draw_width * 2. );
    draw_line( blu, bru, c, draw_width * 2. );
    draw_line( bru, fru, c, draw_width * 2. );
    draw_line( fru, flu, c, draw_width * 2. );
    
    draw_line( flu, fld, c, draw_width * 2. );
    draw_line( blu, bld, c, draw_width * 2. );
    draw_line( bru, brd, c, draw_width * 2. );
    draw_line( fru, frd, c, draw_width * 2. );
    
    draw_line( fld, bld, c, draw_width * 2. );
    draw_line( bld, brd, c, draw_width * 2. );
    draw_line( brd, frd, c, draw_width * 2. );
    draw_line( frd, fld, c, draw_width * 2. );
}

//

vector origin = vector( 0, 0, 0 );
vector eye_pos;
vector look_pos = vector( 0, 0, 0 );
observer eye;

projection retina;

void render_image( out vec4 O, in vec2 P )
{
	UV = ( 2. * P - R ) / H;
	AA = ( .5 * ( dFdx( UV.x ) + dFdy( UV.y ) ) );
    draw_width = 1. / ( R.y * .5 );
    
    eye_pos = vector( -.75, -cos(u_time*.5)*.25, sin(u_time*.5)*.25);
	eye = new_observer( eye_pos, look_pos, 0. );
    retina = new_projection( 90., 1., 2. );
    
    //
    
    draw_line(
        vector_observe( origin, eye, retina ),
        vector_observe( vector( 2, 0, 0 ), eye, retina ),
        vec4( 1, 0, 0, 1 ),
        draw_width * 2.
    );
    
    draw_line(
        vector_observe( origin, eye, retina ),
        vector_observe( vector( 0, 2, 0 ), eye, retina ),
        vec4( 0, 1, 0, 1 ),
        draw_width * 2.
    );
    
    draw_line(
        vector_observe( origin, eye, retina ),
        vector_observe( vector( 0, 0, 2 ), eye, retina ),
        vec4( 0, 0, 1, 1 ),
        draw_width * 2.
    );
    
    //
    
    rotor cube_rotor = yaw_pitch_roll(((M.x/W)*2.-1.)*.5,((M.y/H)*2.-1.)*.5,0.);
    draw_cube( look_pos, .5, cube_rotor, eye, retina, vec4( 1 ) );
    
    //
    
    O = C;
}