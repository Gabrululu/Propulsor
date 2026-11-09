use risc0_build::{embed_methods_with_options, DockerOptionsBuilder, GuestOptionsBuilder};
use std::collections::HashMap;

fn main() {
    // A Docker build is reproducible, so the image ID in the deployed verifier
    // matches what any machine (like the GitHub Actions runner) builds.
    let docker = DockerOptionsBuilder::default()
        .root_dir("guest")
        .docker_container_tag("r0.1.97.0")
        .build()
        .unwrap();
    let guest = GuestOptionsBuilder::default()
        .use_docker(docker)
        .build()
        .unwrap();
    embed_methods_with_options(HashMap::from([("consistent_saving", guest)]));
}
