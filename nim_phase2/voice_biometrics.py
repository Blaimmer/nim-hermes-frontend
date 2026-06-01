"""
Nim Phase 2 — Validación de Biometría Vocal
Speaker Verification usando SpeechBrain ECAPA-TDNN.

Flujo biométrico:
  1. Audio entrante → embedding de 192 dimensiones (ECAPA-TDNN)
  2. Comparación contra Master Voice Print usando Cosine Similarity
  3. Umbral: ≥ 0.85 → Acceso concedido | < 0.85 → Acceso denegado

Modelo: speechbrain/spkrec-ecapa-voxceleb (ECAPA-TDNN)
  - Embeddings de 192 dimensiones
  - Entrenado en VoxCeleb (7,000+ hablantes)
  - Estado del arte en speaker verification

Uso:
  python voice_biometrics.py enroll /path/to/master_voice.wav    # Registrar huella
  python voice_biometrics.py verify /path/to/sample.wav           # Verificar
  python voice_biometrics.py compare /path/a.wav /path/b.wav      # Comparar dos audios
"""

import argparse
import json
import logging
import sys
import time
from pathlib import Path
from typing import Optional

import numpy as np
import torch
from scipy.spatial.distance import cosine

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [NIM-BIO] %(levelname)s %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("nim-bio")

# ─── Constantes ───
EMBEDDING_DIM = 192  # ECAPA-TDNN produce embeddings de 192 dimensiones
SIMILARITY_THRESHOLD = 0.85  # Umbral de similitud de coseno
DEFAULT_VOICEPRINT_PATH = Path(__file__).parent / "master_voiceprint.npy"
MODEL_SOURCE = "speechbrain/spkrec-ecapa-voxceleb"
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"


class VoiceBiometrics:
    """
    Sistema de verificación de hablante usando SpeechBrain ECAPA-TDNN.

    Flujo típico:
      1. Enroll: Registrar la huella vocal maestra del Creador
      2. Verify: Verificar que un audio entrante coincide con la huella
    """

    def __init__(self, voiceprint_path: Path | str = DEFAULT_VOICEPRINT_PATH):
        """
        Inicializa el sistema de biometría vocal.

        Args:
            voiceprint_path: Ruta donde se almacena/carga la huella vocal maestra (.npy)
        """
        self.voiceprint_path = Path(voiceprint_path)
        self._model = None
        self._master_voiceprint: np.ndarray | None = None

        # Cargar huella maestra si existe
        if self.voiceprint_path.exists():
            self._master_voiceprint = np.load(self.voiceprint_path)
            logger.info(
                f"Huella vocal cargada: {self.voiceprint_path} "
                f"({self._master_voiceprint.shape} dims)"
            )
        else:
            logger.warning(
                "No se encontró huella vocal maestra. "
                "Use 'enroll' para registrar una."
            )

    # ─── Carga del Modelo ───

    def _load_model(self):
        """Carga el modelo ECAPA-TDNN perezosamente (lazy loading)."""
        if self._model is not None:
            return self._model

        logger.info(f"Cargando modelo {MODEL_SOURCE} en {DEVICE}...")
        t0 = time.time()

        try:
            from speechbrain.inference.speaker import (
                EncoderClassifier,
                SpeakerRecognition,
            )

            # Usamos SpeakerRecognition que ya incluye cosine similarity
            self._model = SpeakerRecognition.from_hparams(
                source=MODEL_SOURCE,
                savedir=str(Path.home() / ".cache" / "speechbrain" / "spkrec-ecapa"),
                run_opts={"device": DEVICE},
            )
        except Exception as e:
            logger.error(f"Error cargando SpeakerRecognition: {e}")
            logger.info("Intentando con EncoderClassifier como fallback...")
            self._model = EncoderClassifier.from_hparams(
                source=MODEL_SOURCE,
                savedir=str(Path.home() / ".cache" / "speechbrain" / "spkrec-ecapa"),
                run_opts={"device": DEVICE},
            )
            self._use_encoder_fallback = True
        else:
            self._use_encoder_fallback = False

        elapsed = time.time() - t0
        logger.info(f"Modelo cargado en {elapsed:.1f}s")
        return self._model

    # ─── Extracción de Embeddings ───

    def extract_embedding(self, audio_path: str) -> np.ndarray:
        """
        Extrae el embedding de voz de un archivo de audio.

        Args:
            audio_path: Ruta al archivo de audio (WAV, MP3, FLAC, etc.)

        Returns:
            np.ndarray de shape (192,) con el embedding ECAPA-TDNN
        """
        model = self._load_model()
        t0 = time.time()

        if self._use_encoder_fallback:
            # EncoderClassifier: encode_batch devuelve tensores
            embedding = model.encode_batch(torch.tensor([1.0]))
            # Realmente necesitamos cargar el audio correctamente
            from speechbrain.dataio.dataio import read_audio

            signal = read_audio(audio_path).to(DEVICE)
            signal = signal.unsqueeze(0)  # batch dimension
            embedding = model.encode_batch(signal)
            embedding_np = embedding.squeeze().cpu().numpy()
        else:
            # SpeakerRecognition
            # El método verify_files ya hace todo: carga audio, extrae embedding, calcula score
            # Pero necesitamos solo el embedding
            from speechbrain.dataio.dataio import read_audio

            signal = read_audio(audio_path).to(DEVICE)
            signal = signal.unsqueeze(0)  # batch dimension

            # Usar el encoder interno para obtener embeddings
            if hasattr(model, "encode_batch"):
                embedding = model.encode_batch(signal)
            elif hasattr(model, "mods") and hasattr(model.mods, "embedding_model"):
                embedding = model.mods.embedding_model.encode_batch(signal)
            else:
                # Fallback: usar verify_files contra sí mismo normalizado no es ideal
                # Usamos compute_embedding del módulo interno
                embedding = model.compute_embedding(signal)

            embedding_np = embedding.squeeze().cpu().numpy()

        elapsed = time.time() - t0
        logger.debug(
            f"Embedding extraído de {audio_path} en {elapsed:.2f}s — "
            f"shape: {embedding_np.shape}"
        )
        return embedding_np

    # ─── Registro (Enroll) ───

    def enroll(self, audio_path: str) -> None:
        """
        Registra la huella vocal maestra del Creador.

        Args:
            audio_path: Ruta al audio de registro (5-30 segundos de voz clara)
        """
        logger.info(f"REGISTRANDO HUELLA VOCAL desde: {audio_path}")
        embedding = self.extract_embedding(audio_path)

        # Guardar huella
        self.voiceprint_path.parent.mkdir(parents=True, exist_ok=True)
        np.save(self.voiceprint_path, embedding)
        self._master_voiceprint = embedding

        # Log del fingerprint (para verificación visual)
        norm = np.linalg.norm(embedding)
        fingerprint = abs(hash(embedding.tobytes())) % 10**12

        logger.info(
            f"✅ HUELLA REGISTRADA: {self.voiceprint_path}\n"
            f"   Dimensiones: {embedding.shape}\n"
            f"   Norma L2: {norm:.6f}\n"
            f"   Fingerprint: {fingerprint:012d}\n"
            f"   Umbral de aceptación: {SIMILARITY_THRESHOLD}"
        )

    # ─── Verificación ───

    def verify(self, audio_path: str) -> dict:
        """
        Verifica si el audio entrante coincide con la huella vocal maestra.

        Args:
            audio_path: Ruta al audio a verificar

        Returns:
            Dict con:
              - match: bool — True si la similitud >= umbral
              - similarity: float — Cosine similarity (0 a 1)
              - threshold: float — Umbral usado
              - decision: str — "ACCESS_GRANTED" o "ACCESS_DENIED"
        """
        if self._master_voiceprint is None:
            raise RuntimeError(
                "No hay huella vocal registrada. Ejecute 'enroll' primero."
            )

        logger.info(f"VERIFICANDO: {audio_path}")
        sample_embedding = self.extract_embedding(audio_path)

        # Cosine similarity
        similarity = self._cosine_similarity(self._master_voiceprint, sample_embedding)
        match = similarity >= SIMILARITY_THRESHOLD

        decision = "ACCESS_GRANTED" if match else "ACCESS_DENIED"

        result = {
            "match": match,
            "similarity": round(float(similarity), 6),
            "threshold": SIMILARITY_THRESHOLD,
            "decision": decision,
            "timestamp": time.time(),
        }

        logger.info(
            f"{'✅' if match else '❌'} {decision}: "
            f"similitud={similarity:.4f} (umbral={SIMILARITY_THRESHOLD})"
        )

        return result

    def verify_embedding(self, embedding: np.ndarray) -> dict:
        """
        Verifica un embedding pre-extraído contra la huella maestra.

        Útil cuando el audio se procesa en otro componente y solo
        se envía el embedding.

        Args:
            embedding: np.ndarray de shape (192,) con el embedding ECAPA-TDNN

        Returns:
            Dict con match, similarity, threshold, decision (igual que verify())
        """
        if self._master_voiceprint is None:
            raise RuntimeError(
                "No hay huella vocal registrada. Ejecute 'enroll' primero."
            )

        similarity = self._cosine_similarity(self._master_voiceprint, embedding)
        match = similarity >= SIMILARITY_THRESHOLD
        decision = "ACCESS_GRANTED" if match else "ACCESS_DENIED"

        return {
            "match": match,
            "similarity": round(float(similarity), 6),
            "threshold": SIMILARITY_THRESHOLD,
            "decision": decision,
            "timestamp": time.time(),
        }

    def compare(self, audio_path_1: str, audio_path_2: str) -> dict:
        """
        Compara dos archivos de audio sin necesidad de huella registrada.
        Útil para depuración y calibración.

        Returns:
            Dict con similarity entre los dos audios
        """
        logger.info(f"COMPARANDO: {audio_path_1} vs {audio_path_2}")
        emb1 = self.extract_embedding(audio_path_1)
        emb2 = self.extract_embedding(audio_path_2)

        similarity = self._cosine_similarity(emb1, emb2)
        match = similarity >= SIMILARITY_THRESHOLD

        return {
            "similarity": round(float(similarity), 6),
            "threshold": SIMILARITY_THRESHOLD,
            "match": match,
            "decision": "SAME_SPEAKER" if match else "DIFFERENT_SPEAKER",
        }

    # ─── Utilidades ───

    @staticmethod
    def _cosine_similarity(a: np.ndarray, b: np.ndarray) -> np.floating:
        """
        Calcula la similitud de coseno entre dos vectors.
        Retorna un valor entre -1 y 1, donde 1 es idéntico.
        """
        # Cosine distance → similarity = 1 - distance
        return 1.0 - cosine(a, b)

    @property
    def is_enrolled(self) -> bool:
        """True si hay una huella vocal maestra registrada."""
        return self._master_voiceprint is not None

    @property
    def voiceprint_info(self) -> dict | None:
        """Información de la huella vocal registrada."""
        if self._master_voiceprint is None:
            return None
        return {
            "path": str(self.voiceprint_path),
            "dimensions": self._master_voiceprint.shape,
            "norm_l2": float(np.linalg.norm(self._master_voiceprint)),
            "fingerprint": abs(hash(self._master_voiceprint.tobytes())) % 10**12,
            "threshold": SIMILARITY_THRESHOLD,
        }


# ─── Tests ───

def test_cosine_similarity():
    """Pruebas unitarias de cosine similarity."""
    print("=" * 60)
    print("VoiceBiometrics — Pruebas de Cosine Similarity")
    print("=" * 60)

    vb = VoiceBiometrics.__new__(VoiceBiometrics)
    vb._master_voiceprint = None  # No necesitamos huella para estas pruebas

    # Vectores idénticos → similitud ~1.0
    a = np.array([1.0, 0.0, 0.0])
    b = np.array([1.0, 0.0, 0.0])
    sim = vb._cosine_similarity(a, b)
    print(f"\n[IDÉNTICOS] sim({a}, {b}) = {sim:.6f}")
    assert abs(sim - 1.0) < 1e-6, f"Expected 1.0, got {sim}"

    # Vectores ortogonales → similitud ~0.0
    c = np.array([1.0, 0.0, 0.0])
    d = np.array([0.0, 1.0, 0.0])
    sim = vb._cosine_similarity(c, d)
    print(f"[ORTOGONALES] sim({c}, {d}) = {sim:.6f}")
    assert abs(sim - 0.0) < 1e-6, f"Expected 0.0, got {sim}"

    # Vectores opuestos → similitud ~-1.0
    e = np.array([1.0, 0.0, 0.0])
    f = np.array([-1.0, 0.0, 0.0])
    sim = vb._cosine_similarity(e, f)
    print(f"[OPUESTOS] sim({e}, {f}) = {sim:.6f}")
    assert abs(sim + 1.0) < 1e-6, f"Expected -1.0, got {sim}"

    # Vectores aleatorios con alta dimensionalidad (típico de ECAPA)
    rng = np.random.RandomState(42)
    v1 = rng.randn(192)
    v1 = v1 / np.linalg.norm(v1)
    v2 = v1 + 0.1 * rng.randn(192)
    v2 = v2 / np.linalg.norm(v2)
    sim = vb._cosine_similarity(v1, v2)
    print(f"[SIMILARES] sim(v1, v1+noise) = {sim:.6f} (debe ser > 0.9)")

    v3 = rng.randn(192)
    v3 = v3 / np.linalg.norm(v3)
    sim_diff = vb._cosine_similarity(v1, v3)
    print(f"[DIFERENTES] sim(v1, v_random) = {sim_diff:.6f} (debe ser cercano a 0)")

    print("\n" + "=" * 60)
    print("✅ PRUEBAS DE COSINE SIMILARITY PASARON")
    print("=" * 60)


# ─── Entry Point ───


def main():
    parser = argparse.ArgumentParser(
        description="Nim Phase 2 — Biometría Vocal (Speaker Verification)"
    )
    subparsers = parser.add_subparsers(dest="command", help="Comandos disponibles")

    # enroll
    enroll_parser = subparsers.add_parser(
        "enroll", help="Registrar la huella vocal maestra del Creador"
    )
    enroll_parser.add_argument(
        "audio", help="Archivo de audio con la voz del Creador (WAV, MP3, FLAC)"
    )
    enroll_parser.add_argument(
        "--voiceprint",
        default=str(DEFAULT_VOICEPRINT_PATH),
        help="Ruta para guardar la huella vocal",
    )

    # verify
    verify_parser = subparsers.add_parser(
        "verify", help="Verificar un audio contra la huella vocal maestra"
    )
    verify_parser.add_argument("audio", help="Archivo de audio a verificar")
    verify_parser.add_argument(
        "--voiceprint",
        default=str(DEFAULT_VOICEPRINT_PATH),
        help="Ruta de la huella vocal maestra",
    )

    # compare
    compare_parser = subparsers.add_parser(
        "compare", help="Comparar dos archivos de audio (sin huella maestra)"
    )
    compare_parser.add_argument("audio1", help="Primer archivo de audio")
    compare_parser.add_argument("audio2", help="Segundo archivo de audio")

    # info
    info_parser = subparsers.add_parser(
        "info", help="Mostrar información de la huella vocal registrada"
    )
    info_parser.add_argument(
        "--voiceprint",
        default=str(DEFAULT_VOICEPRINT_PATH),
        help="Ruta de la huella vocal maestra",
    )

    # test
    subparsers.add_parser("test", help="Ejecutar pruebas de cosine similarity")

    args = parser.parse_args()

    if args.command == "test":
        test_cosine_similarity()
        return

    if args.command == "enroll":
        vb = VoiceBiometrics(voiceprint_path=args.voiceprint)
        vb.enroll(args.audio)
        print(json.dumps(vb.voiceprint_info, indent=2, default=str))

    elif args.command == "verify":
        vb = VoiceBiometrics(voiceprint_path=args.voiceprint)
        if not vb.is_enrolled:
            logger.error("No hay huella registrada. Use 'enroll' primero.")
            sys.exit(1)
        result = vb.verify(args.audio)
        print(json.dumps(result, indent=2))
        sys.exit(0 if result["match"] else 1)

    elif args.command == "compare":
        vb = VoiceBiometrics.__new__(VoiceBiometrics)
        vb._master_voiceprint = None
        # Inicializar el modelo
        vb._load_model()
        result = vb.compare(args.audio1, args.audio2)
        print(json.dumps(result, indent=2))

    elif args.command == "info":
        vb = VoiceBiometrics(voiceprint_path=args.voiceprint)
        info = vb.voiceprint_info
        if info:
            print(json.dumps(info, indent=2, default=str))
        else:
            print("No hay huella vocal registrada.")

    else:
        parser.print_help()


if __name__ == "__main__":
    main()
