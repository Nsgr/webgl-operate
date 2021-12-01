import {
    auxiliaries,
    Buffer,
    Camera,
    Canvas,
    Context,
    DefaultFramebuffer,
    EventProvider,
    FontFace,
    Invalidate,
    LabelRenderPass,
    Navigation,
    Label,
    Position3DLabel,
    Projected3DLabel,
    Renderer,
    Program,
    Shader,
    Text,
    Wizard,
    vec3,
} from 'webgl-operate';
import { Example } from './example';

class DefaultSceneRenderer extends Renderer {

    protected _defaultFBO: DefaultFramebuffer;

    protected _observedCamera: Camera;
    protected _camera: Camera;

    protected _observedCameraFrustum

    protected _navigation: Navigation;

    protected onInitialize(context: Context, callback: Invalidate,
        eventProvider: EventProvider): boolean {
        return true;
    }

    protected onUninitialize(): void {

    }

    protected onDiscarded(): void {

    }

    protected onUpdate(): boolean {
        return true;
    }

    protected onPrepare(): void {

    }

    protected onFrame(frameNumber: number): void {

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
