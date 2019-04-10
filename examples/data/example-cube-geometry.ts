
import {
    auxiliaries,
    Buffer,
    Context,
    Geometry,
} from 'webgl-operate';

export class ExampleCube extends Geometry {

    static readonly VERTEX_SHADER_SOURCE: string =
        `precision lowp float;

#if __VERSION__ == 100
attribute vec3 a_vertex;
#else
layout(location = 0) in vec3 a_vertex;
#define varying out
#endif

uniform mat4 u_viewProjection;

varying vec3 v_vertex;

void main(void)
{
v_vertex = a_vertex;
gl_Position = u_viewProjection * vec4(a_vertex, 1.0);
}
`;

    static readonly FRAGMENT_SHADER_SOURCE: string =
        `precision lowp float;

#if __VERSION__ == 100
#define fragColor gl_FragColor
#define texture(sampler, coord) texture2D(sampler, coord)
#else
layout(location = 0) out vec4 fragColor;
#define varying in
#endif

varying vec3 v_vertex;

void main(void)
{
fragColor = vec4(v_vertex * 0.5 + 0.5, 1.0);
}
`;

    /**
     * Object constructor, requires a context and an identifier.
     * @param context - Valid context to create the object for.
     * @param identifier - Meaningful name for identification of this instance.
     */
    constructor(context: Context, identifier?: string) {
        super(context, identifier);

        /* Generate identifier from constructor name if none given. */
        identifier = identifier !== undefined && identifier !== `` ? identifier : this.constructor.name;

        const vertexVBO = new Buffer(context, identifier + 'VBO');

        this._buffers.push(vertexVBO);
    }

    /**
     * Generates the vertex array for the box.
     */
    protected generateVertices(): Float32Array {
        const x = 1;
        const y = 1;
        const z = 1;

        return new Float32Array([
            -x, -y, +z,
            +x, -y, +z,
            -x, +y, +z,

            -x, +y, +z,
            +x, -y, +z,
            +x, +y, +z,

            +x, -y, +z,
            +x, -y, -z,
            +x, +y, +z,

            +x, +y, +z,
            +x, -y, -z,
            +x, +y, -z,

            +x, -y, -z,
            -x, -y, -z,
            +x, +y, -z,

            +x, +y, -z,
            -x, -y, -z,
            -x, +y, -z,

            -x, -y, -z,
            -x, -y, +z,
            -x, +y, -z,

            -x, +y, -z,
            -x, -y, +z,
            -x, +y, +z,

            -x, +y, +z,
            +x, +y, +z,
            -x, +y, -z,

            -x, +y, -z,
            +x, +y, +z,
            +x, +y, -z,

            -x, -y, -z,
            +x, -y, -z,
            -x, -y, +z,

            -x, -y, +z,
            +x, -y, -z,
            +x, -y, +z,
        ]);
    }

    /**
     * Binds the vertex buffer object (VBO) to an attribute binding point of a given, pre-defined index.
     */
    protected bindBuffers(indices: Array<GLuint>): void {
        /* Please note the implicit bind in attribEnable. */
        this._buffers[0].attribEnable(0, 3, this.context.gl.FLOAT, false, 0, 0, true, false);
    }

    /**
     * Unbinds the vertex buffer object (VBO) and disables the binding point.
     */
    protected unbindBuffers(indices: Array<GLuint>): void {
        /* Please note the implicit unbind in attribEnable is skipped. */
        this._buffers[0].attribDisable(0, true, true);
    }

    /**
     * Creates the vertex buffer object (VBO) and creates and initializes the buffer's data store.
     * @param aVertex - Attribute binding point for vertices.
     */
    initialize(aVertex: GLuint): boolean {
        const gl = this.context.gl;

        const valid = super.initialize([gl.ARRAY_BUFFER], [aVertex]);

        auxiliaries.assert(this._buffers[0] !== undefined && this._buffers[0].object instanceof WebGLBuffer,
            `expected valid WebGLBuffer`);

        this._buffers[0].data(this.generateVertices(), gl.STATIC_DRAW);

        return valid;
    }

    /**
     * Draws the box.
     */
    draw(): void {
        const { gl } = this.context;
        gl.drawArrays(gl.TRIANGLES, 0, 36);
    }
}
