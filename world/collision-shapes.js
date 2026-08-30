export function createFiniteCylinderSupportColliders({
    originX,
    originZ,
    rotationY = 0,
    localXOffsets,
    localZ = 0,
    topRadius,
    bottomRadius,
    cylinderHeight,
    centerY,
}) {
    const values = { originX, originZ, rotationY, localZ, topRadius, bottomRadius, cylinderHeight, centerY };
    for (const [name, value] of Object.entries(values)) {
        if (!Number.isFinite(value)) throw new Error(`createFiniteCylinderSupportColliders requires finite ${name}`);
    }
    if (!Array.isArray(localXOffsets) || localXOffsets.length === 0 || localXOffsets.some(value => !Number.isFinite(value))) {
        throw new Error('createFiniteCylinderSupportColliders requires finite localXOffsets');
    }
    if (cylinderHeight <= 0) throw new Error('createFiniteCylinderSupportColliders requires positive cylinderHeight');

    const radius = Math.max(Math.abs(topRadius), Math.abs(bottomRadius));
    if (!(radius > 0)) throw new Error('createFiniteCylinderSupportColliders requires a positive cylinder radius');

    const cos = Math.cos(rotationY);
    const sin = Math.sin(rotationY);
    const yMin = centerY - cylinderHeight / 2;
    const yMax = centerY + cylinderHeight / 2;

    return localXOffsets.map(localX => ({
        x: originX + localX * cos + localZ * sin,
        z: originZ - localX * sin + localZ * cos,
        radius,
        yMin,
        // Legacy prop-collider contract names the absolute upper Y bound "height".
        height: yMax,
    }));
}
