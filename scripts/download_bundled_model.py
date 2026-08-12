from pathlib import Path

from huggingface_hub import snapshot_download


REPOSITORY = "onnx-community/whisper-large-v3-turbo_timestamped"
TARGET = Path(__file__).resolve().parents[1] / "models" / REPOSITORY
REQUIRED_FILES = [
    "*.json",
    "merges.txt",
    "vocab.json",
    "onnx/encoder_model_q4.onnx",
    "onnx/decoder_model_merged_q4.onnx",
]


if __name__ == "__main__":
    print(f"Downloading {REPOSITORY} to {TARGET}", flush=True)
    snapshot_download(
        repo_id=REPOSITORY,
        local_dir=TARGET,
        local_dir_use_symlinks=False,
        allow_patterns=REQUIRED_FILES,
    )
    print("Bundled Turbo model is ready.", flush=True)
