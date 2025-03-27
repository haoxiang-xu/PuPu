# server.py
from flask import Flask, request, jsonify

app = Flask(__name__)

@app.route('/hello')
def hello():
    name = request.args.get('name', 'World')
    return jsonify({'message': f'Hello, {name} from Python server!'})

if __name__ == '__main__':
    app.run(port=1166)