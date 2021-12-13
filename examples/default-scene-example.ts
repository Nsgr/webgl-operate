import {
    Buffer,
    Camera,
    Canvas,
    Context,
    Framebuffer,
    Renderbuffer,
    Texture2D,
    DefaultFramebuffer,
    EventProvider,
    Invalidate,
    CuboidGeometry,
    Navigation,
    Renderer,
    Program,
    Shader,
    Wizard,
    BlitPass,
} from 'webgl-operate';
import { mat4, vec4, vec3 } from 'gl-matrix';
import { Example } from './example';

class DefaultSceneRenderer extends Renderer {

    protected _defaultFBO: DefaultFramebuffer;

    protected _observedCamera: Camera;
    protected _observedDepthBuffer: Renderbuffer;
    protected _observedColorRender: Texture2D;
    protected _observedFramebuffer: Framebuffer;

    protected _camera: Camera;
    protected _navigation: Navigation;

    protected _program: Program;
    protected _uViewProjection: WebGLUniformLocation;

    // @scene replace cuboid with scene?
    // + gizmo
    // + observedCameraFrustum
    protected _cuboid: CuboidGeometry;
    protected _texture: Texture2D;
    protected _blit: BlitPass;
    protected _zoomSrcBounds: vec4;
    protected _zoomDstBounds: vec4;

    // frustum geometry
    protected _frustumData: Float32Array;
    protected _frustumBuffer: WebGLBuffer;
    protected _frustumProgram: Program;

    // settings
    protected _renderFrustumToFar = true;
    protected _frustumNearColor = vec3.fromValues(1.0, 1.0, 1.0);
    protected _frustumFarColor = vec3.fromValues(0.5, 0.5, 0.5);

    // settings for observed camera
    protected readonly _observedEye = vec3.fromValues(0.0, 0.0, 5.0);
    protected readonly _observedCenter = vec3.fromValues(0, 0, 0);
    protected readonly _observedUp = vec3.fromValues(0, 1, 0);
    protected readonly _observedNear = 1;
    protected readonly _observedFar = 8;

    protected onInitialize(context: Context, callback: Invalidate,
        eventProvider: EventProvider): boolean {

        // gl for gl functions access
        const gl = context.gl;
        // gl2facade for ADDITIONAL gl functions access
        const gl2facade = this._context.gl2facade;

        // init the default final buffer
        this._defaultFBO = new DefaultFramebuffer(context, 'DefaultFBO');
        this._defaultFBO.initialize();

        // init observed color render
        // we need the internal format for that to just be able to yoink
        const internalFormatAndType = Wizard.queryInternalTextureFormat(this._context, gl.RGBA, Wizard.Precision.half);

        this._observedColorRender = new Texture2D(this._context, 'ColorRenderTexture');
        this._observedColorRender.initialize(1, 1, internalFormatAndType[0], gl.RGBA, internalFormatAndType[1]);
        this._observedColorRender.filter(gl.LINEAR, gl.LINEAR);

        // init observed depth buffer for z test
        this._observedDepthBuffer = new Renderbuffer(this._context, 'DepthRenderbuffer');
        this._observedDepthBuffer.initialize(1, 1, gl.DEPTH_COMPONENT16);

        // init combined observed framebuffer based off the two
        this._observedFramebuffer = new Framebuffer(this._context, 'IntermediateFBO');
        this._observedFramebuffer.initialize([
            [gl2facade.COLOR_ATTACHMENT0, this._observedColorRender],
            [gl.DEPTH_ATTACHMENT, this._observedDepthBuffer]]);

        // @scene
        this._cuboid = new CuboidGeometry(context, 'Cuboid', true, [2.0, 2.0, 2.0]);
        this._cuboid.initialize();

        // @scene init shaders and program for default cube
        const vert = new Shader(context, gl.VERTEX_SHADER, 'mesh-progressive.vert');
        vert.initialize(require('./data/mesh-progressive.vert'));
        const frag = new Shader(context, gl.FRAGMENT_SHADER, 'mesh.frag');
        frag.initialize(require('./data/mesh.frag'));

        // @scene
        this._program = new Program(context, 'CubeProgram');
        this._program.initialize([vert, frag], false);

        this._program.attribute('a_vertex', this._cuboid.vertexLocation);
        this._program.attribute('a_texCoord', this._cuboid.uvCoordLocation);
        this._program.link();
        this._program.bind();

        this._uViewProjection = this._program.uniform('u_viewProjection');

        // @scene
        const identity = mat4.identity(mat4.create());
        gl.uniformMatrix4fv(this._program.uniform('u_model'), false, identity);
        gl.uniform1i(this._program.uniform('u_texture'), 0);
        gl.uniform1i(this._program.uniform('u_textured'), false);

        this._texture = new Texture2D(context, 'Texture');
        this._texture.initialize(1, 1, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE);
        this._texture.wrap(gl.REPEAT, gl.REPEAT);
        this._texture.filter(gl.LINEAR, gl.LINEAR_MIPMAP_LINEAR);
        this._texture.maxAnisotropy(Texture2D.MAX_ANISOTROPY);

        this._texture.fetch('/examples/data/blue-painted-planks-diff-1k-modified.webp').then(() => {
            const gl = context.gl;

            this._program.bind();
            gl.uniform1i(this._program.uniform('u_textured'), true);

            this.finishLoading();
            this.invalidate(true);
        });

        // init observed camera
        this._observedCamera = new Camera(
            this._observedEye,
            this._observedCenter,
            this._observedUp);
        this._observedCamera.near = this._observedNear;
        this._observedCamera.far = this._observedFar;


        this._frustumData = this.createFrustumLines(this._observedCamera, this._renderFrustumToFar, this._frustumNearColor, this._frustumFarColor);

        this._frustumBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this._frustumBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, this._frustumData, gl.STATIC_DRAW);

        const frustumVert = new Shader(this._context, gl.VERTEX_SHADER, 'lines.vert');
        frustumVert.initialize(require('./data/lines.vert'));
        const frustumFrag = new Shader(this._context, gl.FRAGMENT_SHADER, 'lines.frag');
        frustumFrag.initialize(require('./data/lines.frag'));

        this._frustumProgram = new Program(this._context, "LinesProgram");
        this._frustumProgram.initialize([frustumVert, frustumFrag], false);

        this._frustumProgram.link();
        this._frustumProgram.bind();

        this._frustumProgram.attribute('a_vertex', 0);
        this._frustumProgram.attribute('a_color', 1);

        // init actual camera
        this._camera = new Camera();
        this._camera.center = vec3.fromValues(0.0, 0.0, 0.0);
        this._camera.up = vec3.fromValues(0.0, 1.0, 0.0);
        this._camera.eye = vec3.fromValues(0.0, 0.0, 5.0);
        this._camera.near = 0.5;
        this._camera.far = 100.0;

        // init navigation for actual camera
        this._navigation = new Navigation(callback, eventProvider);
        this._navigation.camera = this._camera;

        // @scene blit buffer
        this._blit = new BlitPass(this._context);
        this._blit.initialize();

        return true;
    }

    protected onUninitialize(): void {
        super.uninitialize();

        // @scene
        this._cuboid.uninitialize();
        this._program.uninitialize();

        this._context.gl.deleteBuffer(this._frustumBuffer);
        this._frustumProgram.uninitialize();

        this._defaultFBO.uninitialize();
    }

    protected onDiscarded(): void {
        this._altered.alter('canvasSize');
        this._altered.alter('clearColor');
        this._altered.alter('frameSize');
        this._altered.alter('multiFrameNumber');
    }

    protected onUpdate(): boolean {
        this._navigation.update();

        return this._altered.any || this._camera.altered;
    }

    protected onPrepare(): void {

        if (this._altered.frameSize) {
            this._observedFramebuffer.resize(this._frameSize[0], this._frameSize[1]);
            this._observedCamera.viewport = this._canvasSize;
            this._camera.viewport = this._canvasSize;

            this._zoomSrcBounds = vec4.fromValues(
                0, 0,
                this._frameSize[0], this._frameSize[1]);
        }

        if (this._altered.canvasSize) {
            this._camera.aspect = this._canvasSize[0] / this._canvasSize[1];
            this._observedCamera.aspect = this._canvasSize[0] / this._canvasSize[1];
            this._camera.viewport = this._canvasSize;
            this._observedCamera.viewport = this._canvasSize;

            this._zoomDstBounds = vec4.fromValues(
                this._canvasSize[0] * (1.0 - 0.2 * this._camera.aspect), this._canvasSize[1] * (1.0 - 0.2 * this._camera.aspect),
                this._canvasSize[0] * (1.0 - 0.008 * this._camera.aspect), this._canvasSize[1] * (1.0 - 0.008 * this._camera.aspect));
        }

        if (this._altered.clearColor) {
            this._observedFramebuffer.clearColor(this._clearColor);
            this._defaultFBO.clearColor(this._clearColor);
        }

        this._altered.reset();
        this._camera.altered = false;
        this._observedCamera.altered = false;
    }

    protected onFrame(frameNumber: number): void {
        this.observedFrame();
        this.actualFrame();
    }

    protected observedFrame(): void {
        const gl = this._context.gl;

        this._observedFramebuffer.bind();
        this._observedFramebuffer.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT, false, false);

        gl.viewport(0, 0, this._frameSize[0], this._frameSize[1]);

        gl.enable(gl.CULL_FACE);
        gl.cullFace(gl.BACK);
        gl.enable(gl.DEPTH_TEST);

        this._texture.bind(gl.TEXTURE0);

        this._program.bind();
        gl.uniformMatrix4fv(this._uViewProjection, false, this._observedCamera.viewProjection);

        this._cuboid.bind();
        this._cuboid.draw();
        this._cuboid.unbind();

        this._program.unbind();

        this._texture.unbind(gl.TEXTURE0);

        gl.cullFace(gl.BACK);
        gl.disable(gl.CULL_FACE);

        this._observedFramebuffer.unbind();
    }

    protected actualFrame(): void {
        const gl = this._context.gl;

        // We want to render into the actual FBO now
        this._defaultFBO.bind();
        this._defaultFBO.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT, false, false);

        gl.viewport(0, 0, this._frameSize[0], this._frameSize[1]);

        gl.enable(gl.CULL_FACE);
        gl.cullFace(gl.BACK);
        gl.enable(gl.DEPTH_TEST);

        this._texture.bind(gl.TEXTURE0);

        this._program.bind();
        gl.uniformMatrix4fv(this._uViewProjection, false, this._camera.viewProjection);

        this._cuboid.bind();
        this._cuboid.draw();
        this._cuboid.unbind();

        this._program.unbind();

        this._texture.unbind(gl.TEXTURE0);

        this._frustumProgram.bind();
        gl.uniformMatrix4fv(this._frustumProgram.uniform('u_viewProjection'),
            gl.GL_FALSE, this._camera.viewProjection);


        this._frustumData = this.createFrustumLines(this._observedCamera, this._renderFrustumToFar, this._frustumNearColor, this._frustumFarColor);

        this._frustumBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this._frustumBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, this._frustumData, gl.STATIC_DRAW);

        // refer to https://developer.mozilla.org/en-US/docs/Web/API/WebGLRenderingContext/vertexAttribPointer for more information

        gl.vertexAttribPointer(0, 3, gl.FLOAT, gl.FALSE,
            6 * Float32Array.BYTES_PER_ELEMENT, 0);
        gl.vertexAttribPointer(1, 3, gl.FLOAT, gl.FALSE,
            6 * Float32Array.BYTES_PER_ELEMENT, 3 * Float32Array.BYTES_PER_ELEMENT);

        gl.enableVertexAttribArray(0);
        gl.enableVertexAttribArray(1);

        gl.drawArrays(gl.LINES, 0, this._frustumData.length / 6);
        gl.bindBuffer(gl.ARRAY_BUFFER, Buffer.DEFAULT_BUFFER);

        gl.disableVertexAttribArray(0);
        gl.disableVertexAttribArray(1);

        this._frustumProgram.unbind();

        gl.cullFace(gl.BACK);
        gl.disable(gl.CULL_FACE);

    }

    protected onSwap(): void {
        this._blit.framebuffer = this._observedFramebuffer;
        this._blit.readBuffer = this._context.gl2facade.COLOR_ATTACHMENT0;

        this._blit.target = this._defaultFBO;
        this._blit.drawBuffer = this._context.gl.BACK;

        this._blit.srcBounds = this._zoomSrcBounds;
        this._blit.dstBounds = this._zoomDstBounds;

        this._blit.frame();
    }

    protected vertFovToHorFov(fov: number, aspect: number): number {
        return 2 * Math.atan(Math.tan(fov / 2) * aspect);
    }

    protected calculateSideAndRUp(
        dir: vec3, up: vec3
    ): { side: vec3, rUp: vec3 } {
        const side = vec3.cross(vec3.create(), dir, up);
        vec3.normalize(side, side);
        const rUp = vec3.cross(vec3.create(), side, dir);
        vec3.normalize(rUp, rUp);
        return { side, rUp };
    }

    protected buildCorner(
        out: vec3,
        eye: vec3,
        dir: vec3,
        up: vec3, upFac: number,
        side: vec3, sideFac: number
    ): vec3 {
        vec3.add(out, out, eye);
        vec3.add(out, out, dir);
        vec3.scaleAndAdd(out, out, up, upFac);
        return vec3.scaleAndAdd(out, out, side, sideFac);
    }

    protected createFrustumLines(_camera: Camera, _includeFar: Boolean, _nearColor: vec3, _farColor: vec3): Float32Array {
        const eye = _camera.eye;
        const near = _camera.near;
        const far = _camera.far;
        const dir = vec3.sub(vec3.create(), _camera.center, eye);
        vec3.normalize(dir, dir);
        const up = _camera.up;
        const fovY = _camera.fovy * Math.PI / 180;
        const hFovY = fovY / 2;
        const tHFovY = Math.tan(hFovY);
        const hFovX = this.vertFovToHorFov(fovY, _camera.aspect) / 2;
        const tHFovX = Math.tan(hFovX);

        // calculate a new up vector that is actually perpendicular to dir
        const { side, rUp } = this.calculateSideAndRUp(dir, up);

        const nHalfWidth = tHFovX * near;
        const nHalfHeight = tHFovY * near;
        const nSide = vec3.scale(vec3.create(), side, nHalfWidth);
        const nUp = vec3.scale(vec3.create(), rUp, nHalfHeight);
        const nDir = vec3.scale(vec3.create(), dir, near);

        const fHalfWidth = tHFovX * far;
        const fHalfHeight = tHFovY * far;
        const fSide = vec3.scale(vec3.create(), side, fHalfWidth);
        const fUp = vec3.scale(vec3.create(), rUp, fHalfHeight);
        const fDir = vec3.scale(vec3.create(), dir, far);

        const nnn = this.buildCorner(vec3.create(), eye, nDir, nUp, -1, nSide, -1);
        const npn = this.buildCorner(vec3.create(), eye, nDir, nUp, -1, nSide, +1);
        const pnn = this.buildCorner(vec3.create(), eye, nDir, nUp, +1, nSide, -1);
        const ppn = this.buildCorner(vec3.create(), eye, nDir, nUp, +1, nSide, +1);
        const nnf = this.buildCorner(vec3.create(), eye, fDir, fUp, -1, fSide, -1);
        const npf = this.buildCorner(vec3.create(), eye, fDir, fUp, -1, fSide, +1);
        const pnf = this.buildCorner(vec3.create(), eye, fDir, fUp, +1, fSide, -1);
        const ppf = this.buildCorner(vec3.create(), eye, fDir, fUp, +1, fSide, +1);

        // build lines
        const numLines = (_includeFar) ? 19 : 11;
        const verticesPerLine = 2;
        const componentsPerVertex = 3;

        const colorComponentsPerVertex = 3;

        const vertices =
            new Float32Array(numLines * verticesPerLine * (componentsPerVertex + colorComponentsPerVertex));

        let offset = 0;

        // near plane
        vertices.set(nnn, offset++ * 3);
        vertices.set(_nearColor, offset++ * 3);
        vertices.set(npn, offset++ * 3);
        vertices.set(_nearColor, offset++ * 3);

        vertices.set(npn, offset++ * 3);
        vertices.set(_nearColor, offset++ * 3);
        vertices.set(ppn, offset++ * 3);
        vertices.set(_nearColor, offset++ * 3);

        vertices.set(ppn, offset++ * 3);
        vertices.set(_nearColor, offset++ * 3);
        vertices.set(pnn, offset++ * 3);
        vertices.set(_nearColor, offset++ * 3);

        vertices.set(pnn, offset++ * 3);
        vertices.set(_nearColor, offset++ * 3);
        vertices.set(nnn, offset++ * 3);
        vertices.set(_nearColor, offset++ * 3);

        // cam to near plane

        vertices.set(_camera.eye, offset++ * 3);
        vertices.set(_nearColor, offset++ * 3);
        vertices.set(nnn, offset++ * 3);
        vertices.set(_nearColor, offset++ * 3);

        vertices.set(_camera.eye, offset++ * 3);
        vertices.set(_nearColor, offset++ * 3);
        vertices.set(npn, offset++ * 3);
        vertices.set(_nearColor, offset++ * 3);

        vertices.set(_camera.eye, offset++ * 3);
        vertices.set(_nearColor, offset++ * 3);
        vertices.set(ppn, offset++ * 3);
        vertices.set(_nearColor, offset++ * 3);

        vertices.set(_camera.eye, offset++ * 3);
        vertices.set(_nearColor, offset++ * 3);
        vertices.set(pnn, offset++ * 3);
        vertices.set(_nearColor, offset++ * 3);

        // blender-like up indicator
        const upTriangle1 = this.buildCorner(vec3.create(), eye, nDir, nUp, +1.1, nSide, +0.5);
        const upTriangle2 = this.buildCorner(vec3.create(), eye, nDir, nUp, +1.1, nSide, -0.5);
        const upTriangleTop = this.buildCorner(vec3.create(), eye, nDir, nUp, +1.4, nSide, 0);

        vertices.set(upTriangle1, offset++ * 3);
        vertices.set(_nearColor, offset++ * 3);
        vertices.set(upTriangle2, offset++ * 3);
        vertices.set(_nearColor, offset++ * 3);

        vertices.set(upTriangle1, offset++ * 3);
        vertices.set(_nearColor, offset++ * 3);
        vertices.set(upTriangleTop, offset++ * 3);
        vertices.set(_nearColor, offset++ * 3);

        vertices.set(upTriangle2, offset++ * 3);
        vertices.set(_nearColor, offset++ * 3);
        vertices.set(upTriangleTop, offset++ * 3);
        vertices.set(_nearColor, offset++ * 3);

        // far plane
        if (_includeFar) {
            // far plane itself
            vertices.set(nnf, offset++ * 3);
            vertices.set(_farColor, offset++ * 3);
            vertices.set(npf, offset++ * 3);
            vertices.set(_farColor, offset++ * 3);

            vertices.set(npf, offset++ * 3);
            vertices.set(_farColor, offset++ * 3);
            vertices.set(ppf, offset++ * 3);
            vertices.set(_farColor, offset++ * 3);

            vertices.set(ppf, offset++ * 3);
            vertices.set(_farColor, offset++ * 3);
            vertices.set(pnf, offset++ * 3);
            vertices.set(_farColor, offset++ * 3);

            vertices.set(pnf, offset++ * 3);
            vertices.set(_farColor, offset++ * 3);
            vertices.set(nnf, offset++ * 3);
            vertices.set(_farColor, offset++ * 3);

            // near -> far connections
            vertices.set(nnn, offset++ * 3);
            vertices.set(_farColor, offset++ * 3);
            vertices.set(nnf, offset++ * 3);
            vertices.set(_farColor, offset++ * 3);

            vertices.set(npn, offset++ * 3);
            vertices.set(_farColor, offset++ * 3);
            vertices.set(npf, offset++ * 3);
            vertices.set(_farColor, offset++ * 3);

            vertices.set(pnn, offset++ * 3);
            vertices.set(_farColor, offset++ * 3);
            vertices.set(pnf, offset++ * 3);
            vertices.set(_farColor, offset++ * 3);

            vertices.set(ppn, offset++ * 3);
            vertices.set(_farColor, offset++ * 3);
            vertices.set(ppf, offset++ * 3);
            vertices.set(_farColor, offset++ * 3);
        }

        return vertices;
    }

}

export class DefaultSceneExample extends Example {

    private _canvas: Canvas;
    private _renderer: DefaultSceneRenderer;

    onInitialize(element: HTMLCanvasElement | string): boolean {

        this._canvas = new Canvas(element, { antialias: false });

        this._canvas.controller.multiFrameNumber = 1;
        this._canvas.framePrecision = Wizard.Precision.byte;
        this._canvas.frameScale = [1.0, 1.0];

        this._renderer = new DefaultSceneRenderer();
        this._canvas.renderer = this._renderer;

        return true;
    }

    onUninitialize(): void {
        this._canvas.dispose();
        (this._renderer as Renderer).uninitialize();
    }

    get canvas(): Canvas {
        return this._canvas;
    }

    get renderer(): DefaultSceneRenderer {
        return this._renderer;
    }
}
