/* eslint-env jest */
import { act, render } from "@testing-library/react";
import ShaderBlobBackground from "./shader_blob_background";

const GL_CONST = {
  VERTEX_SHADER: 1,
  FRAGMENT_SHADER: 2,
  COMPILE_STATUS: 3,
  LINK_STATUS: 4,
  ARRAY_BUFFER: 5,
  STATIC_DRAW: 6,
  FLOAT: 7,
  TRIANGLES: 8,
};

const makeMockGl = () => ({
  ...GL_CONST,
  createShader: jest.fn(() => ({})),
  shaderSource: jest.fn(),
  compileShader: jest.fn(),
  getShaderParameter: jest.fn(() => true),
  getShaderInfoLog: jest.fn(() => ""),
  deleteShader: jest.fn(),
  createProgram: jest.fn(() => ({})),
  attachShader: jest.fn(),
  linkProgram: jest.fn(),
  getProgramParameter: jest.fn(() => true),
  getProgramInfoLog: jest.fn(() => ""),
  useProgram: jest.fn(),
  createBuffer: jest.fn(() => ({})),
  bindBuffer: jest.fn(),
  bufferData: jest.fn(),
  getAttribLocation: jest.fn(() => 0),
  enableVertexAttribArray: jest.fn(),
  vertexAttribPointer: jest.fn(),
  getUniformLocation: jest.fn(() => ({})),
  viewport: jest.fn(),
  uniform1f: jest.fn(),
  uniform1i: jest.fn(),
  uniform2f: jest.fn(),
  uniform3f: jest.fn(),
  uniform3fv: jest.fn(),
  drawArrays: jest.fn(),
  deleteBuffer: jest.fn(),
  deleteProgram: jest.fn(),
});

describe("ShaderBlobBackground", () => {
  let originalGetContext;
  let originalRAF;
  let originalCAF;
  let originalIO;
  let rafCallbacks;

  beforeEach(() => {
    originalGetContext = window.HTMLCanvasElement.prototype.getContext;
    originalRAF = window.requestAnimationFrame;
    originalCAF = window.cancelAnimationFrame;
    originalIO = window.IntersectionObserver;

    rafCallbacks = [];
    window.requestAnimationFrame = jest.fn((cb) => {
      rafCallbacks.push(cb);
      return rafCallbacks.length;
    });
    window.cancelAnimationFrame = jest.fn();

    class MockIntersectionObserver {
      constructor(cb) {
        this.cb = cb;
      }
      observe() {
        this.cb([{ isIntersecting: true }]);
      }
      disconnect() {}
    }
    window.IntersectionObserver = MockIntersectionObserver;
  });

  afterEach(() => {
    window.HTMLCanvasElement.prototype.getContext = originalGetContext;
    window.requestAnimationFrame = originalRAF;
    window.cancelAnimationFrame = originalCAF;
    window.IntersectionObserver = originalIO;
  });

  test("renders nothing when webgl2 is unavailable (getContext returns null) — graceful no-op", () => {
    window.HTMLCanvasElement.prototype.getContext = jest.fn(() => null);
    const { container, unmount } = render(<ShaderBlobBackground />);
    expect(container.querySelector("canvas")).toBeNull();
    expect(() => unmount()).not.toThrow();
  });

  test("renders a canvas, runs a frame, and cleans up (RAF/ResizeObserver/IntersectionObserver/GL) without throwing on unmount", () => {
    const gl = makeMockGl();
    window.HTMLCanvasElement.prototype.getContext = jest.fn(() => gl);

    const { container, unmount } = render(
      <ShaderBlobBackground colors={["#112233", "#445566"]} blur={38} />,
    );

    const canvas = container.querySelector("canvas");
    expect(canvas).not.toBeNull();

    // Drive one animation frame manually (RAF is mocked, not auto-running).
    expect(rafCallbacks.length).toBeGreaterThan(0);
    act(() => {
      rafCallbacks[0]();
    });
    expect(gl.drawArrays).toHaveBeenCalled();

    expect(() => unmount()).not.toThrow();
    expect(window.cancelAnimationFrame).toHaveBeenCalled();
    expect(gl.deleteBuffer).toHaveBeenCalled();
    expect(gl.deleteProgram).toHaveBeenCalled();
  });
});
