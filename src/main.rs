use core::sync::atomic::AtomicBool;
use gl::GL;
use js_sys::Date;
use minwebgl as gl;
use serde::Deserialize;
use std::sync::{atomic::Ordering, Mutex, OnceLock};
use wasm_bindgen::{prelude::wasm_bindgen, JsValue};
use web_sys::{window, CustomEvent, EventTarget};

#[derive(Clone, Copy, Deserialize, Debug, Default)]
struct MouseUniform {
    x: f32,
    y: f32,
    down_x: f32,
    down_y: f32,
}

#[derive(Clone, Copy, Deserialize, Debug, Default)]
struct PlayerState {
    mouse: Option<MouseUniform>,
}

static PLAYER_STATE_STORAGE: OnceLock<Mutex<PlayerState>> = OnceLock::new();
static FRAGMENT_SHADER_STORAGE: OnceLock<Mutex<String>> = OnceLock::new();
static RELOAD_FRAGMENT_SHADER: AtomicBool = AtomicBool::new(false);

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
        gl::error!("Failed to dispatch event {:?}", error)
    }
}

#[wasm_bindgen]
pub fn update_player_state(state: JsValue) {
    match serde_wasm_bindgen::from_value::<PlayerState>(state) {
        Ok(state) => {
            if let Some(mutex) = PLAYER_STATE_STORAGE.get() {
                if let Ok(mut player_state) = mutex.lock() {
                    player_state.mouse = state.mouse.or(player_state.mouse);
                } else {
                    gl::error!("Failed to lock player state mutex");
                }
            } else if PLAYER_STATE_STORAGE
                .set(Mutex::new(PlayerState { mouse: state.mouse }))
                .is_err()
            {
                report_error("Failed to init mutex: don't change player state in separate threads");
            }
        }
        Err(error) => report_error(&format!("Unkown player state format: {:?}", error)),
    }
}

fn prepare_shader(shadertoy_code: &str) -> String {
    format!("#version 300 es 
precision mediump float;

uniform vec3 iResolution; // image/buffer	The viewport resolution (z is pixel aspect ratio, usually 1.0)
uniform float	iTime; // image/sound/buffer	Current time in seconds
uniform float	iTimeDelta; // image/buffer	Time it takes to render a frame, in seconds
uniform int	iFrame; // image/buffer	Current frame
uniform float	iFrameRate; // image/buffer	Number of frames rendered per second
uniform vec4	iMouse; // image/buffer	xy = current pixel coords (if LMB is down). zw = click pixel
uniform vec4	iDate; // image/buffer/sound	Year, month, day, time in seconds in .xyzw
{}
in vec2 vUv;
out vec4 frag_color;

void main() {{
    mainImage(frag_color, vUv * iResolution.xy);
}}", shadertoy_code)
}

fn get_shader() -> Option<String> {
    Some(FRAGMENT_SHADER_STORAGE.get()?.lock().ok()?.to_owned())
}

fn run() -> Result<(), gl::WebglError> {
    gl::browser::setup(Default::default());
    let gl = gl::context::retrieve_or_make()?;

    // Vertex and fragment shader source code
    let vertex_shader_src = include_str!("../shaders/shader.vert");
    let default_frag_shader_src = include_str!("../shaders/shader.frag");
    let frag_shader = get_shader().unwrap_or(prepare_shader(default_frag_shader_src));
    let program =
        gl::ProgramFromSources::new(vertex_shader_src, &frag_shader).compile_and_link(&gl)?;
    gl.use_program(Some(&program));
    RELOAD_FRAGMENT_SHADER.store(false, Ordering::Relaxed);

    let mut last_time = 0f64;
    let mut frame = 0f32;

    let mut resolution_loc = gl.get_uniform_location(&program, "iResolution");
    let mut time_loc = gl.get_uniform_location(&program, "iTime");
    let mut time_delta_loc = gl.get_uniform_location(&program, "iTimeDelta");
    let mut frame_loc = gl.get_uniform_location(&program, "iFrame");
    let mut frame_rate_loc = gl.get_uniform_location(&program, "iFrameRate");
    let mut mouse_loc = gl.get_uniform_location(&program, "iMouse");
    let mut date_loc = gl.get_uniform_location(&program, "iDate");

    // Define the update and draw logic
    let update_and_draw = {
        move |mut t: f64| {
            t /= 1000f64;
            if RELOAD_FRAGMENT_SHADER.load(Ordering::Relaxed) {
                if let Some(fragment_shader_mutex) = FRAGMENT_SHADER_STORAGE.get() {
                    if let Ok(fragment_shader) = fragment_shader_mutex.lock() {
                        let program =
                            gl::ProgramFromSources::new(vertex_shader_src, &fragment_shader)
                                .compile_and_link(&gl);
                        match program {
                            Ok(program) => {
                                gl.use_program(Some(&program));
                                resolution_loc = gl.get_uniform_location(&program, "iResolution");
                                time_loc = gl.get_uniform_location(&program, "iTime");
                                time_delta_loc = gl.get_uniform_location(&program, "iTimeDelta");
                                frame_loc = gl.get_uniform_location(&program, "iFrame");
                                frame_rate_loc = gl.get_uniform_location(&program, "iFrameRate");
                                mouse_loc = gl.get_uniform_location(&program, "iMouse");
                                date_loc = gl.get_uniform_location(&program, "iDate");
                            }
                            Err(error) => {
                                report_error(&format!("Shader compilation error: {}", error));
                            }
                        }
                        RELOAD_FRAGMENT_SHADER.store(false, Ordering::Relaxed);
                    } else {
                        gl::error!("Failed to lock mutex: attempt to read shader at same time with writing, don't write shader to often");
                    }
                } else {
                    gl::warn!("Reload shader signal received with no shader");
                }
            }
            gl.uniform1f(time_loc.as_ref(), t as f32);
            if let Some(window) = web_sys::window() {
                gl.uniform3f(
                    resolution_loc.as_ref(),
                    gl.drawing_buffer_width() as f32,
                    gl.drawing_buffer_height() as f32,
                    window.device_pixel_ratio() as f32,
                );
            } else {
                // I hope aspect ratio is not so impotant
                gl.uniform3f(
                    resolution_loc.as_ref(),
                    gl.drawing_buffer_width() as f32,
                    gl.drawing_buffer_height() as f32,
                    1f32,
                );
            }

            let time_dif = if last_time == 0f64 {
                0f32
            } else {
                (t - last_time) as f32
            };
            gl.uniform1f(time_delta_loc.as_ref(), time_dif);
            last_time = t;
            gl.uniform1f(frame_loc.as_ref(), frame);
            frame += 1f32;
            gl.uniform1f(frame_rate_loc.as_ref(), 1f32 / time_dif);
            if let Some(player_state_mutex) = PLAYER_STATE_STORAGE.get() {
                if let Ok(&PlayerState {
                    mouse:
                        Some(MouseUniform {
                            x,
                            y,
                            down_x,
                            down_y,
                        }),
                }) = player_state_mutex.try_lock().as_deref()
                // Don't wait while rendering, update mouse next rendering
                {
                    gl.uniform4f(mouse_loc.as_ref(), x, y, down_x, down_y);
                }
            }
            let date = Date::new_0();
            gl.uniform4f(
                date_loc.as_ref(),
                date.get_full_year() as f32,
                date.get_month() as f32,
                date.get_day() as f32,
                (date.get_hours() * 3600 + date.get_minutes() * 60 + date.get_seconds()) as f32,
            );
            // Draw points
            gl.draw_arrays(GL::TRIANGLE_STRIP, 0, 4);
            true
        }
    };

    // Run the render loop
    gl::exec_loop::run(update_and_draw);
    Ok(())
}

fn main() {
    run().unwrap()
}
