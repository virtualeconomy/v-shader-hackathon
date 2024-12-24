use core::sync::atomic::AtomicBool;
use js_sys::Date;
use minwebgl as gl;
use serde::Deserialize;
use std::sync::{atomic::Ordering, Mutex, OnceLock};
use wasm_bindgen::{
    closure::{Closure, IntoWasmClosure},
    convert::FromWasmAbi,
    prelude::wasm_bindgen,
    JsCast, JsValue,
};
use web_sys::{window, CustomEvent, Element, EventTarget, WebGl2RenderingContext as GL};

#[derive(Clone, Copy, Deserialize, Debug)]
struct ResolutionUniform {
    width: f32,
    height: f32,
    pixel_aspect_ratio: f32,
}

#[derive(Clone, Copy, Deserialize, Debug, Default)]
struct MouseUniform {
    x: f32,
    y: f32,
    down_x: f32,
    down_y: f32,
}

#[derive(Clone, Copy, Deserialize, Debug)]
struct DateUniform {
    year: f32,
    month: f32,
    day: f32,
    time: f32,
}

#[derive(Clone, Copy, Deserialize, Debug, Default)]
struct Uniforms {
    resolution: Option<ResolutionUniform>,
    time: Option<f32>,
    time_delta: Option<f32>,
    frame: Option<f32>,
    frame_rate: Option<f32>,
    mouse: Option<MouseUniform>,
    date: Option<DateUniform>,
}

#[derive(Clone, Copy, Deserialize, Debug, Default)]
struct Playback {
    paused: Option<bool>,
    speed: Option<f32>,
}

#[derive(Clone, Copy, Deserialize, Debug, Default)]
struct PlayerState {
    playback: Option<Playback>,
    uniforms: Option<Uniforms>,
}

static PLAYER_STATE_STORAGE: OnceLock<Mutex<PlayerState>> = OnceLock::new();
static FRAGMENT_SHADER_STORAGE: OnceLock<Mutex<String>> = OnceLock::new();
static RELOAD_FRAGMENT_SHADER: AtomicBool = AtomicBool::new(false);
static LOST_WEBGL2_CONTEXT: AtomicBool = AtomicBool::new(false);
static MOUSE_DOWN: AtomicBool = AtomicBool::new(false);

#[wasm_bindgen]
pub fn set_fragment_shader(new_shader_code: &str) {
    if let Some(mutex) = FRAGMENT_SHADER_STORAGE.get() {
        if let Ok(mut shader) = mutex.lock() {
            *shader = prepare_shader(new_shader_code);
        } else {
            report_error("Failed to lock mutex: don't change shader in separate threads");
            return;
        }
    } else if FRAGMENT_SHADER_STORAGE
        .set(Mutex::new(prepare_shader(new_shader_code)))
        .is_err()
    {
        report_error("Failed to init mutex: don't change shader in separate threads");
        return;
    }

    RELOAD_FRAGMENT_SHADER.store(true, Ordering::Relaxed);
}

#[wasm_bindgen]
pub fn update_player_state(state: JsValue) {
    match serde_wasm_bindgen::from_value::<PlayerState>(state) {
        Ok(state) => {
            if let Some(mutex) = PLAYER_STATE_STORAGE.get() {
                if let Ok(mut player_state) = mutex.lock() {
                    if let Some(uniforms) = &mut player_state.uniforms {
                        if let Some(new_uniforms) = state.uniforms {
                            uniforms.resolution = new_uniforms.resolution.or(uniforms.resolution);
                            uniforms.time = new_uniforms.time.or(uniforms.time);
                            uniforms.time_delta = new_uniforms.time_delta.or(uniforms.time_delta);
                            uniforms.frame = new_uniforms.frame.or(uniforms.frame);
                            uniforms.frame_rate = new_uniforms.frame_rate.or(uniforms.frame_rate);
                            uniforms.mouse = new_uniforms.mouse.or(uniforms.mouse);
                            uniforms.date = new_uniforms.date.or(uniforms.date);
                        }
                    } else {
                        player_state.uniforms = state.uniforms;
                    }

                    if let Some(playback) = &mut player_state.playback {
                        if let Some(new_playback) = state.playback {
                            playback.paused = new_playback.paused.or(playback.paused);
                            playback.speed = new_playback.speed.or(playback.speed);
                        }
                    } else {
                        player_state.playback = state.playback;
                    }
                } else {
                    gl::error!("Failed to lock player state mutex");
                }
            } else if PLAYER_STATE_STORAGE.set(Mutex::new(state)).is_err() {
                report_error("Failed to init mutex: don't change player state in separate threads");
            }
        }
        Err(error) => report_error(&format!("Unkown player state format: {error:?}")),
    }
}

#[wasm_bindgen]
pub fn play() {
    set_paused(false);
}

#[wasm_bindgen]
pub fn stop() {
    set_paused(true);
}

fn set_paused(value: bool) {
    if let Some(mutex) = PLAYER_STATE_STORAGE.get() {
        if let Ok(mut player_state) = mutex.lock() {
            if let Some(playback) = &mut player_state.playback {
                playback.paused = Some(value);
            } else {
                player_state.playback = Some(Playback {
                    paused: Some(value),
                    ..Default::default()
                });
            }
        } else {
            gl::error!("Failed to lock player state mutex");
        }
    } else if PLAYER_STATE_STORAGE
        .set(Mutex::new(PlayerState {
            playback: Some(Playback {
                paused: Some(value),
                ..Default::default()
            }),
            ..Default::default()
        }))
        .is_err()
    {
        report_error("Failed to init mutex: don't change player state in separate threads");
    }
}

pub fn report_error(message: &str) {
    gl::error!("{}", message);
    let event_init = web_sys::CustomEventInit::new();
    event_init.set_detail(&JsValue::from_str(message));
    let event = match CustomEvent::new_with_event_init_dict("WasmErrorEvent", &event_init) {
        Ok(event) => event,
        Err(error) => {
            gl::error!("Failed to create custom event: {:?}", error);
            return;
        }
    };

    let target: EventTarget = if let Some(window) = window() {
        window.into()
    } else {
        gl::error!("Failed to get window for event dispatch");
        return;
    };

    if let Err(error) = target.dispatch_event(&event) {
        gl::error!("Failed to dispatch event {error:?}");
    }
}

fn prepare_shader(shadertoy_code: &str) -> String {
    format!("#version 300 es 
precision mediump float;

uniform vec3 u_resolution; // image/buffer	The viewport resolution (z is pixel aspect ratio, usually 1.0)
uniform float	u_time; // image/sound/buffer	Current time in seconds
uniform float	u_time_delta; // image/buffer	Time it takes to render a frame, in seconds
uniform int	u_frame; // image/buffer	Current frame
uniform float	u_frame_rate; // image/buffer	Number of frames rendered per second
uniform vec4	u_mouse; // image/buffer	xy = current pixel coords (if LMB is down). zw = click pixel
uniform vec4	u_date; // image/buffer/sound	Year, month, day, time in seconds in .xyzw
{shadertoy_code}
in vec2 vUv;
out vec4 frag_color;

void main() {{
    render_image(frag_color, vUv * u_resolution.xy);
}}")
}

fn get_shader() -> Option<String> {
    Some(FRAGMENT_SHADER_STORAGE.get()?.lock().ok()?.to_owned())
}

fn add_event_listener<F: IntoWasmClosure<dyn FnMut(E)> + 'static, E: FromWasmAbi + 'static>(
    event_target: &EventTarget,
    event_type: &str,
    f: F,
) {
    let closure: Closure<dyn FnMut(E)> = Closure::new(f);
    let callback = closure.as_ref().unchecked_ref::<js_sys::Function>();
    if let Err(error) = event_target.add_event_listener_with_callback(event_type, callback) {
        gl::error!("Can not subscribe to canvas events{:?}", error);
    }
    closure.forget();
}

fn update_mouse_uniform(update: &dyn Fn(Option<MouseUniform>) -> Option<MouseUniform>) {
    if let Some(mutex) = PLAYER_STATE_STORAGE.get() {
        if let Ok(mut player_state) = mutex.lock() {
            if let Some(uniforms) = &mut player_state.uniforms {
                uniforms.mouse = update(uniforms.mouse);
            } else {
                player_state.uniforms = Some(Uniforms {
                    mouse: update(None),
                    ..Default::default()
                });
            }
        } else {
            gl::error!("Failed to lock player state mutex");
        }
    } else if PLAYER_STATE_STORAGE
        .set(Mutex::new(PlayerState {
            uniforms: Some(Uniforms {
                mouse: update(None),
                ..Default::default()
            }),
            ..Default::default()
        }))
        .is_err()
    {
        report_error("Failed to init mutex: don't change player state in separate threads");
    }
}

fn run() -> Result<(), gl::WebglError> {
    gl::browser::setup(minwebgl::browser::Config::default());
    let canvas = gl::canvas::retrieve_or_make()?;
    let gl = gl::context::from_canvas(&canvas)?;

    add_event_listener(
        &canvas.clone().into(),
        "webglcontextlost",
        move |event: web_sys::Event| {
            gl::error!("Canvas lost WebGL2 context");
            event.prevent_default();
            LOST_WEBGL2_CONTEXT.store(true, Ordering::Relaxed);
        },
    );

    add_event_listener(
        &canvas.clone().into(),
        "webglcontextrestored",
        move |_: web_sys::Event| {
            gl::info!("Canvas restored WebGL2 context");
            LOST_WEBGL2_CONTEXT.store(false, Ordering::Relaxed);
        },
    );

    let canvas_clone = canvas.clone();
    add_event_listener(
        &canvas.clone().into(),
        "mousedown",
        move |mouse_event: web_sys::MouseEvent| {
            let rect = canvas_clone
                .unchecked_ref::<Element>()
                .get_bounding_client_rect();
            let x = mouse_event.client_x() as f32 - rect.left() as f32;
            let y = mouse_event.client_y() as f32 - rect.top() as f32;
            update_mouse_uniform(&|_| {
                Some(MouseUniform {
                    x,
                    y,
                    down_x: x,
                    down_y: y,
                })
            });
            MOUSE_DOWN.store(true, Ordering::Relaxed);
        },
    );

    add_event_listener(
        &canvas.clone().into(),
        "mouseup",
        move |_: web_sys::MouseEvent| {
            MOUSE_DOWN.store(false, Ordering::Relaxed);
        },
    );

    let canvas_clone = canvas.clone();
    add_event_listener(
        &canvas.clone().into(),
        "mousemove",
        move |mouse_event: web_sys::MouseEvent| {
            if MOUSE_DOWN.load(Ordering::Relaxed) {
                let rect = canvas_clone
                    .unchecked_ref::<Element>()
                    .get_bounding_client_rect();
                let x = mouse_event.client_x() as f32 - rect.left() as f32;
                let y = mouse_event.client_y() as f32 - rect.top() as f32;
                update_mouse_uniform(&|old_uniform| {
                    Some(if let Some(old_uniform) = old_uniform {
                        MouseUniform {
                            x,
                            y,
                            ..old_uniform
                        }
                    } else {
                        MouseUniform {
                            x,
                            y,
                            down_x: x,
                            down_y: y,
                        }
                    })
                });
            }
        },
    );

    // Vertex and fragment shader source code
    let vertex_shader_src = include_str!("../shaders/shader.vert");
    let default_frag_shader_src = include_str!("../shaders/shader.frag");
    let frag_shader = get_shader().unwrap_or(prepare_shader(default_frag_shader_src));
    let mut program =
        gl::ProgramFromSources::new(vertex_shader_src, &frag_shader).compile_and_link(&gl)?;
    gl.use_program(Some(&program));
    RELOAD_FRAGMENT_SHADER.store(false, Ordering::Relaxed);

    let mut last_real_time = 0f64;
    let mut last_playback_time = 0f64;
    let mut frame = 0f32;
    let mut reload_webgl2_context = false;
    let mut player_state = PlayerState::default();

    let mut resolution_loc = gl.get_uniform_location(&program, "u_resolution");
    let mut time_loc = gl.get_uniform_location(&program, "u_time");
    let mut time_delta_loc = gl.get_uniform_location(&program, "u_time_delta");
    let mut frame_loc = gl.get_uniform_location(&program, "u_frame");
    let mut frame_rate_loc = gl.get_uniform_location(&program, "u_frame_rate");
    let mut mouse_loc = gl.get_uniform_location(&program, "u_mouse");
    let mut date_loc = gl.get_uniform_location(&program, "u_date");

    // Define the update and draw logic
    let update_and_draw = move |mut t: f64| {
        t /= 1000f64;
        let mut force_reload_shader = false;
        match (
            LOST_WEBGL2_CONTEXT.load(Ordering::Relaxed),
            reload_webgl2_context,
        ) {
            (true, false) => {
                // Free resources
                gl.delete_program(Some(&program));
                reload_webgl2_context = true;
                return true;
            }
            (true, true) => {
                return true;
            }
            (false, true) => {
                gl::info!("forsing shader reload");
                force_reload_shader = true;
                reload_webgl2_context = false;
            }
            _ => {}
        }

        if force_reload_shader || RELOAD_FRAGMENT_SHADER.load(Ordering::Relaxed) {
            let fragment_shader = get_shader().unwrap_or(prepare_shader(default_frag_shader_src));
            let new_program = gl::ProgramFromSources::new(vertex_shader_src, &fragment_shader)
                .compile_and_link(&gl);
            match new_program {
                Ok(new_program) => {
                    program = new_program;
                    gl.use_program(Some(&program));
                    resolution_loc = gl.get_uniform_location(&program, "u_resolution");
                    time_loc = gl.get_uniform_location(&program, "u_time");
                    time_delta_loc = gl.get_uniform_location(&program, "u_time_delta");
                    frame_loc = gl.get_uniform_location(&program, "u_frame");
                    frame_rate_loc = gl.get_uniform_location(&program, "u_frame_rate");
                    mouse_loc = gl.get_uniform_location(&program, "u_mouse");
                    date_loc = gl.get_uniform_location(&program, "u_date");
                    gl::info!("shader reloaded");
                }
                Err(error) => {
                    report_error(&format!("Shader compilation error: {error}"));
                }
            }
            RELOAD_FRAGMENT_SHADER.store(false, Ordering::Relaxed);
        }

        // Disable render if paused
        player_state = if let Some(player_state_mutex) = PLAYER_STATE_STORAGE.get() {
            player_state_mutex.try_lock().as_deref().cloned().ok()
        } else {
            None
        }
        .unwrap_or(player_state);
        if let Some(Playback {
            paused: Some(true), ..
        }) = player_state.playback
        {
            // Do nothing, except update last_real_time to prevent accumulation of time_delta
            last_real_time = t;
            return true;
        }

        // u_resolution
        if let Some(Uniforms {
            resolution: Some(resolution),
            ..
        }) = player_state.uniforms
        {
            gl.uniform3f(
                resolution_loc.as_ref(),
                resolution.width,
                resolution.height,
                resolution.pixel_aspect_ratio,
            );
        } else {
            gl.uniform3f(
                resolution_loc.as_ref(),
                gl.drawing_buffer_width() as f32,
                gl.drawing_buffer_height() as f32,
                if let Some(window) = web_sys::window() {
                    window.device_pixel_ratio() as f32
                } else {
                    1.0
                },
            );
        };

        // This code is designed to seamlessly continue playback after `Resume`
        let (time, time_delta) = if last_real_time == 0.0 {
            // First frame, just init
            last_playback_time = t;
            (last_playback_time, 0.0)
        } else {
            let real_time_delta = t - last_real_time;
            let playback_time_delta = real_time_delta
                * f64::from(
                    if let Some(Playback {
                        speed: Some(speed), ..
                    }) = player_state.playback
                    {
                        speed
                    } else {
                        1.0
                    },
                );
            last_playback_time += playback_time_delta;
            (last_playback_time, playback_time_delta)
        };

        // u_time
        gl.uniform1f(
            time_loc.as_ref(),
            if let Some(Uniforms {
                time: Some(fixed_time),
                ..
            }) = player_state.uniforms
            {
                fixed_time
            } else {
                time as f32
            },
        );

        // u_time_delta
        let time_delta = if let Some(Uniforms {
            time_delta: Some(fixed_time_delta),
            ..
        }) = player_state.uniforms
        {
            fixed_time_delta
        } else {
            time_delta as f32
        };
        gl.uniform1f(time_delta_loc.as_ref(), time_delta);
        last_real_time = t;

        // u_frame
        gl.uniform1f(
            frame_loc.as_ref(),
            if let Some(Uniforms {
                frame: Some(fixed_frame),
                ..
            }) = player_state.uniforms
            {
                fixed_frame
            } else {
                frame
            },
        );
        frame += 1f32;

        // u_frame_rate
        gl.uniform1f(
            frame_rate_loc.as_ref(),
            if let Some(Uniforms {
                frame_rate: Some(fixed_frame_rate),
                ..
            }) = player_state.uniforms
            {
                fixed_frame_rate
            } else {
                1f32 / time_delta
            },
        );

        // u_mouse
        if let Some(Uniforms {
            mouse:
                Some(MouseUniform {
                    x,
                    y,
                    down_x,
                    down_y,
                }),
            ..
        }) = player_state.uniforms
        {
            gl.uniform4f(mouse_loc.as_ref(), x, y, down_x, down_y);
        }

        // u_date
        if let Some(Uniforms {
            date: Some(replaced_date),
            ..
        }) = player_state.uniforms
        {
            gl.uniform4f(
                date_loc.as_ref(),
                replaced_date.year,
                replaced_date.month,
                replaced_date.day,
                replaced_date.time,
            );
        } else {
            let date = Date::new_0();
            gl.uniform4f(
                date_loc.as_ref(),
                date.get_full_year() as f32,
                date.get_month() as f32,
                date.get_day() as f32,
                (date.get_hours() * 3600 + date.get_minutes() * 60 + date.get_seconds()) as f32,
            );
        };

        // Draw points
        gl.draw_arrays(GL::TRIANGLE_STRIP, 0, 4);
        true
    };

    // Run the render loop
    gl::exec_loop::run(update_and_draw);
    Ok(())
}

fn main() {
    run().unwrap();
}
