export function createDynamicLightPool({ THREE, directSceneAdd, scene, maxVisible }) {
    const logical = [];
    const slots = Array.from({ length: Math.max(0, maxVisible | 0) }, () => {
        const light = new THREE.PointLight(0xffffff, 0, 0, 2);
        light.userData.dynamicLightPoolSlot = true;
        light.visible = true;
        return light;
    });
    let attached = false;
    let lastSelected = [];

    function attach() {
        if (attached) return;
        attached = true;
        if (slots.length) directSceneAdd(...slots);
    }

    function register(light) {
        if (!light || !light.isPointLight || light.userData?.dynamicLightPoolSlot) return false;
        if (!logical.includes(light)) logical.push(light);
        light.userData.logicalDynamicLight = true;
        return true;
    }

    function unregister(light) {
        const index = logical.indexOf(light);
        if (index >= 0) logical.splice(index, 1);
    }

    function update(position) {
        attach();
        const px = position?.x ?? 0;
        const py = position?.y ?? 0;
        const pz = position?.z ?? 0;
        for (const light of logical) {
            const dx = light.position.x - px;
            const dy = light.position.y - py;
            const dz = light.position.z - pz;
            light._cullDistSq = dx * dx + dy * dy + dz * dz;
        }
        logical.sort((a, b) => a._cullDistSq - b._cullDistSq);
        lastSelected = logical.slice(0, slots.length);
        for (let i = 0; i < slots.length; i++) {
            const slot = slots[i];
            const source = lastSelected[i];
            if (!source || source.visible === false) {
                slot.intensity = 0;
                slot.distance = 0;
                slot.decay = 2;
                continue;
            }
            slot.color.copy(source.color);
            slot.intensity = source.intensity;
            slot.distance = source.distance;
            slot.decay = source.decay;
            slot.position.copy(source.position);
        }
    }

    function dispose() {
        if (attached) {
            for (const slot of slots) scene.remove(slot);
        }
        logical.length = 0;
        slots.length = 0;
        lastSelected = [];
        attached = false;
    }

    function stats() {
        return Object.freeze({ logical: logical.length, slots: slots.length, selected: lastSelected.length, attached });
    }

    return Object.freeze({ attach, register, unregister, update, dispose, stats, logical, slots });
}
