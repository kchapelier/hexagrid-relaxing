"use strict";

function Hexagrid (sideSize, rng, searchIterationCount, forceCircleShape) {
    if (sideSize < 2) {
        throw Error('Hexagrid: sideSize must be greater than or equal 2');
    }

    this.sideSize = sideSize;
    this.rng = rng || Math.random;
    this.searchIterationCount = searchIterationCount;

    this.points = [];
    this.triangles = [];
    this.baseQuads = [];
    this.quads = [];
    this.neighbours = [];

    // prepare points

    const maxHeight = this.sideSize * 2 - 1;
    const maxDeltaHeight = this.sideSize - maxHeight * 0.5;
    const ratio = maxHeight / 2 - maxDeltaHeight;

    for (let x = 0; x < this.sideSize * 2 - 1; x++) {
        const height = (x < this.sideSize) ? this.sideSize + x : this.sideSize * 3 - 2 - x;
        const deltaHeight = this.sideSize - height * 0.5;
        for (let y = 0; y < height; y++) {
            const isSide = (x === 0) || x === (this.sideSize * 2 - 2) || (y === 0) || (y === height - 1);
            this.points.push([
                (x - this.sideSize + 1) * Hexagrid.sideLength / ratio,
                (y + deltaHeight - maxHeight / 2) / ratio,
                isSide
            ]);
        }
    }

    // prepare triangles

    let offset = 0;

    for (let x = 0; x < (sideSize * 2 - 2); x++) {
        let height = (x < sideSize) ? (sideSize + x) : (sideSize * 3 - 2 - x);

        if (x < sideSize - 1) {
            // left side
            for (let y = 0; y < height; y++) {
                this.triangles.push([offset + y, offset + y + height, offset + y + height + 1, true]);
                if (y >= height - 1) {
                    break;
                }
                this.triangles.push([offset + y + height + 1, offset + y + 1, offset + y, true]);
            }
        } else {
            // right side
            for (let y = 0; y < height - 1; y++) {
                this.triangles.push([offset + y, offset + y + height, offset + y + 1, true]);
                if (y >= height - 2) {
                    break;
                }
                this.triangles.push([offset + y + 1, offset + y + height, offset + y + height + 1, true]);
            }
        }

        offset += height;
    }

    // convert pair of adjacent triangles to big quads

    let triIndex = 0;
    const adjacents = [];

    while(1) {
        let searchCount = 0;
        do{
            triIndex = this.rng() * this.triangles.length | 0;
            searchCount++;
        } while(searchCount < this.searchIterationCount && this.triangles[triIndex][3] === false);

        if (searchCount === this.searchIterationCount) {
            break;
        }

        adjacents.length = 0; // reset array
        let adjacentCount = this.getAdjacentTriangles(triIndex, adjacents);
        if (adjacentCount > 0) {
            const triangle0 = this.triangles[triIndex];
            const triangle1 = this.triangles[adjacents[0]];

            let indices = [
                triangle0[0], triangle0[1], triangle0[2],
                triangle1[0], triangle1[1], triangle1[2]
            ].sort(function (a, b) { return a - b; });

            const quadIndices = new Array(4);
            let quadIndexCount = 1;
            quadIndices[0] = indices[0];
            for (let i = 1; i < 6; i++) {
                if (indices[i] !== indices[i - 1]) {
                    quadIndices[quadIndexCount++] = indices[i];
                }
            }

            //assert(quadIndexCount === 4);

            this.baseQuads.push([quadIndices[0], quadIndices[2], quadIndices[3], quadIndices[1]]);
            triangle0[3] = false;
            triangle1[3] = false;
        }
    }

    // convert big quads to 4 small quads

    const middles = {};
    for (let i = 0; i < this.baseQuads.length; i++) {
        const quad = this.baseQuads[i];
        const indexCenter = this.points.length;

        const point0 = this.points[quad[0]];
        const point1 = this.points[quad[1]];
        const point2 = this.points[quad[2]];
        const point3 = this.points[quad[3]];

        this.points.push([
            (point0[0] + point1[0] + point2[0] + point3[0]) / 4.0,
            (point0[1] + point1[1] + point2[1] + point3[1]) / 4.0,
            false
        ]);

        this.subdivide(4, quad, middles, indexCenter);
    }

    // convert remaining triangles to 3 small quads

    for (let i = 0; i < this.triangles.length; i++) {
        const triangle = this.triangles[i];
        if (triangle[3] === true) {
            const indexCenter = this.points.length;

            const point0 = this.points[triangle[0]];
            const point1 = this.points[triangle[1]];
            const point2 = this.points[triangle[2]];

            this.points.push([
                (point0[0] + point1[0] + point2[0]) / 3.0,
                (point0[1] + point1[1] + point2[1]) / 3.0,
                false
            ]);

            this.subdivide(3, triangle, middles, indexCenter);
        }
    }

    // compute neighbours

    this.neighbours.length = this.points.length;
    for (let i = 0; i < this.neighbours.length; i++) {
        this.neighbours[i] = [];
    }

    for (let i = 0; i < this.quads.length; i++) {
        const quad = this.quads[i];
        for (let j = 0; j < 4; j++) {
            const index1 = quad[j];
            const index2 = quad[(j + 1) & 3];

            {
                const neighbour = this.neighbours[index1];
                // check
                let good = true;
                for (let k = 0; k < neighbour.length; k++) {
                    if(neighbour[k] === index2) {
                        good = false;
                        break;
                    }
                }
                if (good) {
                    //assert(neighbour.length < 6);
                    neighbour.push(index2);
                }
            }

            {
                const neighbour = this.neighbours[index2];
                // check
                let good = true;
                for (let k = 0; k < neighbour.length; k++) {
                    if(neighbour[k] === index1) {
                        good = false;
                        break;
                    }
                }
                if (good) {
                    //assert(neighbour.length < 6);
                    neighbour.push(index1);
                }
            }
        }
    }

    // optionally, force the sides of the hexagon to a circular shape

    if (forceCircleShape) {
        for (let i = 0; i < this.points.length; i++) {
            const point = this.points[i];

            if (point[2] === true) {
                // normalize the point "vector" to a length of 1
                var dist = Math.sqrt(point[0] * point[0] + point[1] * point[1]);
                point[0] /= dist;
                point[1] /= dist;
            }
        }
    }
}

Hexagrid.prototype.sideSize = 0;
Hexagrid.prototype.rng = null;
Hexagrid.prototype.searchIterationCount  = 0;
Hexagrid.prototype.points = null;
Hexagrid.prototype.triangles = null;
Hexagrid.prototype.baseQuads = null;
Hexagrid.prototype.quads = null;
Hexagrid.prototype.neighbours = null;

Hexagrid.prototype.relax = function () {
    for (let i = 0; i < this.points.length; i++) {
        if (this.points[i][2] === true) {
            continue;
        }

        const neighbour = this.neighbours[i];
        let sumX = 0;
        let sumY = 0;
        for (let j = 0; j < neighbour.length; j++) {
            sumX += this.points[neighbour[j]][0];
            sumY += this.points[neighbour[j]][1];
        }
        this.points[i][0] = sumX / neighbour.length;
        this.points[i][1] = sumY / neighbour.length;
    }
};

Hexagrid.prototype.relaxWeighted = function () {
    for (let i = 0; i < this.points.length; i++) {
        if (this.points[i][2] === true) {
            continue;
        }

        const neighbour = this.neighbours[i];
        let sumX = 0.;
        let sumY = 0.;
        let weight = 0.;
        for (let j = 0; j < neighbour.length; j++) {
            // weighted by distance, the further two points are, the more they attract each other
            // big edges will tend to shrink and small edges will tend to grow
            // this results in slightly less variance in the quads area
            // the grid also converges faster to equilibrium
            let w = Math.sqrt(Math.pow(this.points[i][0] - this.points[neighbour[j]][0], 2) + Math.pow(this.points[i][1] - this.points[neighbour[j]][1], 2));

            sumX += this.points[neighbour[j]][0] * w;
            sumY += this.points[neighbour[j]][1] * w;
            weight+= w;
        }
        this.points[i][0] = sumX / weight;
        this.points[i][1] = sumY / weight;
    }
};

Hexagrid.prototype.relaxSide = function () {
    const radius = 1;

    for (let i = 0; i < this.points.length; i++) {
        if (this.points[i][2] === false) {
            continue;
        }

        const dx = this.points[i][0];
        const dy = this.points[i][1];
        const distance = radius - Math.sqrt(dx * dx + dy * dy);

        this.points[i][0] += (dx * distance) * 0.1;
        this.points[i][1] += (dy * distance) * 0.1;
    }
};

Hexagrid.prototype.subdivide = function (count, indices, middles, indexCenter) {
    const halfSegmentIndex = new Array(count);

    for (let j = 0; j < count; j++) {
        const indexA = indices[j];
        const indexB = indices[(j + 1) % count];
        const pointA = this.points[indexA];
        const pointB = this.points[indexB];

        const key = Math.min(indexA, indexB) + ':' + Math.max(indexA, indexB);

        if (!middles.hasOwnProperty(key)) {
            halfSegmentIndex[j] = this.points.length;
            const isSide = pointA[2] && pointB[2];
            this.points.push([
                (pointA[0] + pointB[0]) / 2.0,
                (pointA[1] + pointB[1]) / 2.0,
                isSide
            ]);
            middles[key] = halfSegmentIndex[j];
        } else {
            halfSegmentIndex[j] = middles[key];
        }
    }
    
    for (let j = 0; j < count; j++) {
        const nextIndex = (j + 1) % count;
        this.quads.push([indexCenter, halfSegmentIndex[j], indices[nextIndex], halfSegmentIndex[nextIndex]]);
    }
};

Hexagrid.prototype.getAdjacentTriangles = function (triIndex, adjacents) {
    const triangle = this.triangles[triIndex];

    for (let i = 0; i < this.triangles.length; i++) {
        const ntriangle = this.triangles[i];
        if (i === triIndex || ntriangle[3] !== true) {
            continue;
        }

        let shareCount = 0;
        for(let j = 0; j < 3; j++) {
            for (let k = 0; k < 3; k++) {
                if (triangle[j] === ntriangle[k]) {
                    shareCount ++;
                    break;
                }
            }
        }
        //assert(shareCount < 3);
        if (shareCount === 2) {
            adjacents.push(i);
            //assert(adjacents.length < 4);
        }
    }

    return adjacents.length;
};

// Math.sqrt(3) / 2; or Math.sin( 60 * Math.PI / 180 ); or 0.5 * Math.tan(PI * 2.0 * 1.66);
// So many choice but a single value, the minimal diameter / maximal diameter ratio
Hexagrid.sideLength = 0.8660254037844386;