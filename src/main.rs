use core::sync::atomic::AtomicBool;
use gl::GL;
use minwebgl as gl;
use std::sync::{atomic::Ordering, Mutex, OnceLock};
use wasm_bindgen::prelude::wasm_bindgen;

static FRAGMENT_SHADER_STORAGE: OnceLock<Mutex<String>> = OnceLock::new();
static RELOAD_FRAGMENT_SHADER: AtomicBool = AtomicBool::new(false);

#[wasm_bindgen]
pub fn set_fragment_shader(new_shader_code: &str) {
    if let Some(mutex) = FRAGMENT_SHADER_STORAGE.get() {
        let mut shader = mutex.lock().unwrap();
        *shader = new_shader_code.to_string();
    } else {
        FRAGMENT_SHADER_STORAGE
            .set(Mutex::new(new_shader_code.into()))
            .unwrap();
    }
    RELOAD_FRAGMENT_SHADER.store(true, Ordering::Relaxed);
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
    let frag_shader = get_shader().unwrap_or(default_frag_shader_src.into());
    let program =
        gl::ProgramFromSources::new(vertex_shader_src, &frag_shader).compile_and_link(&gl)?;
    gl.use_program(Some(&program));
    RELOAD_FRAGMENT_SHADER.store(false, Ordering::Relaxed);

    let width = gl.drawing_buffer_width() as f32;
    let height = gl.drawing_buffer_height() as f32;

    let mut resolution_loc = gl.get_uniform_location(&program, "u_resolution");
    let mut time_loc = gl.get_uniform_location(&program, "u_time");

    // Define the update and draw logic
    let update_and_draw = {
        move |t: f64| {
            if RELOAD_FRAGMENT_SHADER.load(Ordering::Relaxed) {
                let program = if let Ok(program) = gl::ProgramFromSources::new(
                    vertex_shader_src,
                    &FRAGMENT_SHADER_STORAGE.get().unwrap().lock().unwrap(),
                )
                .compile_and_link(&gl)
                {
                    program
                } else {
                    return false;
                };
                gl.use_program(Some(&program));
                resolution_loc = gl.get_uniform_location(&program, "u_resolution");
                time_loc = gl.get_uniform_location(&program, "u_time");
                RELOAD_FRAGMENT_SHADER.store(false, Ordering::Relaxed);
            }
            gl.uniform1f(time_loc.as_ref(), t as f32);
            gl.uniform2f(resolution_loc.as_ref(), width, height);
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
