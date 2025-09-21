# server.py
import base64
import io
import os
from contextlib import contextmanager

from flask import Flask, request, jsonify
from flask_cors import CORS
from PyPDF2 import PdfReader
import pdfplumber

app = Flask(__name__)
CORS(app)

@contextmanager
def _open_pdf_stream(pdf_source):
    """Yield a readable binary stream for a PDF source."""

    if isinstance(pdf_source, (bytes, bytearray)):
        stream = io.BytesIO(pdf_source)
        yield stream
        return

    if isinstance(pdf_source, str):
        if pdf_source.strip().startswith("data:"):
            try:
                _, encoded = pdf_source.split(",", 1)
            except ValueError as exc:
                raise ValueError("Invalid data URL format") from exc
            stream = io.BytesIO(base64.b64decode(encoded))
            yield stream
            return

        if os.path.exists(pdf_source):
            with open(pdf_source, "rb") as file_obj:
                yield file_obj
            return

    raise TypeError("pdf_source must be bytes, a data URL, or an existing file path")
def _pdf_to_text(pdf_source):
    """Extract text from a PDF source.

    Args:
        pdf_source: Bytes, a data URL string, or a filesystem path to the PDF.

    Returns:
        str: Plain text content extracted from the PDF.

    Raises:
        RuntimeError: If no compatible PDF backend is available.
        ValueError: For corrupted PDFs or decoding errors.
        TypeError: When pdf_source is of an unsupported type.
    """

    with _open_pdf_stream(pdf_source) as stream:
        # Prefer pdfplumber for higher fidelity when available
        if pdfplumber is not None:
            try:
                with pdfplumber.open(stream) as pdf:
                    return "\n".join(page.extract_text() or "" for page in pdf.pages)
            except Exception as exc:
                raise ValueError("Failed to read PDF with pdfplumber") from exc

        if PdfReader is not None:
            try:
                reader = PdfReader(stream)
                return "\n".join(page.extract_text() or "" for page in reader.pages)
            except Exception as exc:
                raise ValueError("Failed to read PDF with PyPDF2") from exc

    raise RuntimeError(
        "No PDF reading backend available. Install 'pdfplumber' or 'PyPDF2'."
    )

@app.route('/pdf_to_text', methods=['POST'])
def pdf_to_text():
    payload = request.get_json(silent=True) or {}
    pdf_payload = payload.get('pdf')

    if not pdf_payload:
        return jsonify({'error': 'Missing pdf payload'}), 400

    try:
        text = _pdf_to_text(pdf_payload)
    except (ValueError, TypeError) as exc:  # Invalid input or decoding issues
        return jsonify({'error': str(exc)}), 400
    except RuntimeError as exc:  # Missing dependencies
        return jsonify({'error': str(exc)}), 500
    except Exception as exc:  # Unexpected errors
        return jsonify({'error': f'Unexpected error: {exc}'}), 500

    return jsonify({'text': text}), 200


@app.route('/hello')
def hello():
    name = request.args.get('name', 'World')
    return jsonify({'message': f'Hello, {name} from Python server!'})

if __name__ == '__main__':
    app.run(port=1166)
