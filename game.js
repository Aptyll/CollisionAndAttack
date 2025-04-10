const canvas = document.getElementById('gameCanvas');
const context = canvas.getContext('2d');

// --- Constants ---
const MAP_WIDTH = 1000;
const MAP_HEIGHT = 700;
const MOVEMENT_MARKER_START_RADIUS = 15;
const MOVEMENT_MARKER_DURATION = 750; // Shorten duration slightly for faster fade

// --- Canvas Setup ---
// Adjust canvas size to window size - NO LONGER USED, use fixed size
/*
function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas(); // Initial resize
*/
// Set fixed canvas size
canvas.width = MAP_WIDTH;
canvas.height = MAP_HEIGHT;

// --- Game State ---
const gameObjects = []; // Holds all units and bunkers
let selectedUnits = [];
let currentPlayerId = 1; // Start as Player 1
let isDragging = false;
let dragStartX = 0;
let dragStartY = 0;
let dragEndX = 0;
let dragEndY = 0;
const movementMarkers = []; // To store {x, y, timestamp, playerId}
const attackEffects = []; // Store temporary attack visuals (LASER LINES)
const MARKER_DURATION_MS = 1000; // How long movement markers last
const CLICK_DRAG_THRESHOLD = 5; // Pixels to differentiate click vs drag
const CHECKER_SIZE = 50; // Size of background checker squares
const BACKGROUND_COLOR_1 = '#222222';
const BACKGROUND_COLOR_2 = '#282828';
const SELECTION_COLOR = 'white';
const MOVEMENT_MARKER_COLOR = 'hsl(60, 50%, 60%)'; // Softer yellow
let isAMoveMode = false; // Tracks if we are waiting for A-move click
const TARGET_ACQUISITION_RANGE_FACTOR = 1.5; // How much farther units look than they shoot
const BUNKER_SPAWN_COOLDOWN = 1500; // ms (1.5 seconds) - Increased spawn rate
const RALLY_POINT_MARKER_COLOR = 'lime';
const HEALTH_BAR_COLOR = 'white';
const HEALTH_BAR_FONT = '10px Arial';
const BUNKER_HEALTH_FONT = '12px Arial';
const ATTACK_RANGE_INDICATOR_COLOR = 'rgba(255, 0, 0, 0.2)'; // Semi-transparent red
const ATTACK_EFFECT_COLOR = 'red';
const ATTACK_EFFECT_DURATION = 100; // ms
const SPARK_BURST_COLOR = 'white';
const SPARK_BURST_DURATION = 150; // ms, slightly longer than laser
const SPARK_COUNT = 5;
const SPARK_LENGTH = 4;

// Constants for styling
const DASH_PATTERN = [6, 4]; // 6px line, 4px gap
const ROTATION_SPEED_FACTOR = 0.05; // Slower is faster denominator, adjust as needed
const RALLY_LINE_DASH_PATTERN = [5, 5];
const RALLY_LINE_ANIMATION_SPEED = 0.08;
const RALLY_PULSE_DURATION = 1000; // ms for one pulse cycle
const RALLY_PULSE_START_RADIUS = 10;

// New Ripple Effect Constants
const RIPPLE_RING_COUNT = 3;
const RIPPLE_START_RADIUS_FACTOR = 1.8; // Multiplier for base start radius
const RIPPLE_RING_SPACING_FACTOR = 0.3;
const RIPPLE_LINE_WIDTH = 2; // Increased line width for boldness
// New constants for staggered/dotted rings
const RIPPLE_RING_DELAY_FACTOR = 0.15; // Delay between rings starting (fraction of total duration)
const RIPPLE_DASH_PATTERN = [4, 4];   // Dashes for the rings
const RIPPLE_ROTATION_SPEED = 0.06;  // Speed for rotating ring dashes
const A_MOVE_MARKER_COLOR = 'hsl(0, 70%, 60%)'; // Less intense red for A-Move
const A_MOVE_RIPPLE_RING_COUNT = 5; // More rings for A-Move

// New Selection Animation Constants
const SELECTION_DASH_PATTERN = [8, 4]; // Longer dash
const SELECTION_ANIMATION_SPEED = 0.07;
const SELECTION_LINE_WIDTH_UNIT = 2; // Thicker than before
const SELECTION_LINE_WIDTH_BUNKER = 3; // Even thicker for bunkers

// Store player-specific data including supply and color
const players = {
    1: { supplyCap: 5, currentSupply: 0, color: 'hsl(170, 50%, 50%)' }, // Teal
    2: { supplyCap: 5, currentSupply: 0, color: 'hsl(30, 60%, 55%)' },  // Orange
    3: { supplyCap: 5, currentSupply: 0, color: 'hsl(260, 45%, 60%)' }, // Purple
    4: { supplyCap: 5, currentSupply: 0, color: 'hsl(330, 50%, 60%)' }  // Pink
};

// --- Helper Functions (Add Color Helper) ---
function getDarkerHslColor(hslColor, reduction = 20) {
    // Simple parsing assuming "hsl(H, S%, L%)" format
    const parts = hslColor.match(/hsl\((\d+),\s*(\d+)%,\s*(\d+)%\)/);
    if (!parts) return '#000000'; // Fallback

    const h = parseInt(parts[1]);
    const s = parseInt(parts[2]);
    let l = parseInt(parts[3]);

    l = Math.max(0, l - reduction); // Reduce lightness, clamp at 0

    return `hsl(${h}, ${s}%, ${l}%)`;
}

// --- Bunker Class ---
class Bunker {
    constructor(x, y, playerId, size = 80) {
        this.id = `bunker_${playerId}_${Math.random().toString(16).slice(2)}`;
        this.x = x;
        this.y = y;
        this.size = size;
        this.playerId = playerId;
        this.color = players[playerId].color;
        this.maxHealth = 500;
        this.health = this.maxHealth;
        this.type = 'bunker';
        this.rallyPoint = { x: MAP_WIDTH / 2, y: MAP_HEIGHT / 2 };
        this.spawnCooldown = BUNKER_SPAWN_COOLDOWN;
        this.lastSpawnTime = 0;
    }

    drawBody(ctx, isSelected) {
        if (this.health <= 0) return;
        const now = performance.now(); // Needed for selection animation

        const halfSize = this.size / 2;
        const drawX = this.x - halfSize;
        const drawY = this.y - halfSize;

        // Draw Bunker Body
        ctx.fillStyle = this.color;
        ctx.fillRect(drawX, drawY, this.size, this.size);

        // Draw Darker Border
        ctx.strokeStyle = getDarkerHslColor(this.color, 15);
        ctx.lineWidth = 3; // Increased bunker border thickness
        ctx.strokeRect(drawX, drawY, this.size, this.size);

        // --- Draw Animated Selection --- (Modified)
        if (isSelected && this.playerId === currentPlayerId) {
            // Save context state we are about to change
            const originalDash = ctx.getLineDash();
            const originalOffset = ctx.lineDashOffset;
            const originalWidth = ctx.lineWidth;
            const originalStroke = ctx.strokeStyle;

            // Calculate animation offset
            const dashOffset = -(now * SELECTION_ANIMATION_SPEED) % (SELECTION_DASH_PATTERN[0] + SELECTION_DASH_PATTERN[1]);

            ctx.strokeStyle = this.color; // Use player color
            ctx.lineWidth = SELECTION_LINE_WIDTH_BUNKER; // Use new thickness
            ctx.setLineDash(SELECTION_DASH_PATTERN); // Apply dash pattern
            ctx.lineDashOffset = dashOffset; // Apply animation offset

            const padding = 4;
            ctx.strokeRect(
                drawX - padding,
                drawY - padding,
                this.size + padding * 2,
                this.size + padding * 2
            );

            // Restore context state
            ctx.setLineDash(originalDash);
            ctx.lineDashOffset = originalOffset;
            ctx.lineWidth = originalWidth;
            ctx.strokeStyle = originalStroke;
        }
    }

    getUIDrawCommands(isSelected) {
        if (this.health <= 0) return [];

        const commands = [];
        const now = performance.now(); // Needed for animations
        const halfSize = this.size / 2;

        commands.push({
            type: 'text',
            content: this.health,
            x: this.x,
            y: this.y - halfSize - 8,
            color: HEALTH_BAR_COLOR,
            font: BUNKER_HEALTH_FONT,
            textAlign: 'center'
        });

        if (isSelected && this.playerId === currentPlayerId) {
            const lineDashOffset = -(now * RALLY_LINE_ANIMATION_SPEED) % (RALLY_LINE_DASH_PATTERN[0] + RALLY_LINE_DASH_PATTERN[1]);

            commands.push({
                type: 'rally',
                startX: this.x,
                startY: this.y,
                endX: this.rallyPoint.x,
                endY: this.rallyPoint.y,
                color: this.color,
                playerId: this.playerId,
                lineWidth: 1,
                lineDash: RALLY_LINE_DASH_PATTERN,
                lineDashOffset: lineDashOffset,
                pulseDuration: RALLY_PULSE_DURATION,
                rippleStartRadius: RALLY_PULSE_START_RADIUS
            });
        }

        return commands;
    }

    update(now, allGameObjects, playersState) {
        if (this.health <= 0) return;
        const playerState = playersState[this.playerId];
        if (!playerState) {
            console.error(`Bunker ${this.id} could not find playerState for player ${this.playerId}`);
            return;
        }

        const timeSinceLastSpawn = now - this.lastSpawnTime;
        if (timeSinceLastSpawn >= this.spawnCooldown) {
            console.log(`Bunker ${this.id} ready to spawn (cooldown met).`);
            if (playerState.currentSupply < playerState.supplyCap) {
                console.log(`Bunker ${this.id} supply ok (${playerState.currentSupply}/${playerState.supplyCap}). Attempting spawn.`);
                const spawnOffset = this.size / 2 + 20;
                const spawnX = this.x + spawnOffset;
                const spawnY = this.y;
                console.log(`Bunker ${this.id} calculated spawn point: (${spawnX.toFixed(1)}, ${spawnY.toFixed(1)})`);

                let blocked = false;
                for (const obj of allGameObjects) {
                     if (obj.health > 0 && Math.hypot(obj.x - spawnX, obj.y - spawnY) < (obj.size / 2 + 15)) {
                        console.log(`Bunker ${this.id} spawn blocked by object ${obj.id} at (${obj.x.toFixed(1)}, ${obj.y.toFixed(1)})`);
                        blocked = true;
                        break;
                    }
                }

                if (!blocked) {
                    console.log(`Bunker ${this.id} SPAWNING UNIT!`);
                    const newUnit = new Unit(spawnX, spawnY, this.playerId);
                    allGameObjects.push(newUnit);
                    playerState.currentSupply += newUnit.supplyCost;
                    newUnit.attackMoveTo(this.rallyPoint.x, this.rallyPoint.y);
                    this.lastSpawnTime = now;
                    console.log(`Player ${this.playerId} spawned unit. Supply: ${playerState.currentSupply}/${playerState.supplyCap}`);
                    return;
                }
            } else {
                 console.log(`Bunker ${this.id} cannot spawn: supply capped (${playerState.currentSupply}/${playerState.supplyCap}).`);
            }
            this.lastSpawnTime = now;
        }
    }

    isUnderPoint(pointX, pointY) {
        const halfSize = this.size / 2;
        return (pointX >= this.x - halfSize && pointX <= this.x + halfSize &&
                pointY >= this.y - halfSize && pointY <= this.y + halfSize);
    }

    takeDamage(damageAmount) {
        this.health -= damageAmount;
        if (this.health < 0) this.health = 0;
    }
}

// --- Unit Class ---
class Unit {
    constructor(x, y, playerId, size = 30, speed = 2) {
        this.id = `unit_${playerId}_${Math.random().toString(16).slice(2)}`;
        this.x = x;
        this.y = y;
        this.size = size;
        this.playerId = playerId;
        this.color = players[playerId].color;
        this.targetX = x;
        this.targetY = y;
        this.speed = speed;
        this.type = 'unit';
        this.supplyCost = 1;
        this.maxHealth = 100;
        this.health = this.maxHealth;
        this.attackDamage = 10;
        this.attackRange = 100; // Increased attack range
        this.attackCooldown = 1000;
        this.lastAttackTime = 0;
        this.targetUnit = null;
        this.targetAcquisitionRange = this.attackRange * TARGET_ACQUISITION_RANGE_FACTOR;
        this.commandState = 'idle';
        this.aMoveTargetX = x;
        this.aMoveTargetY = y;
    }

    drawBody(ctx, isSelected) {
        if (this.health <= 0) return;
        const now = performance.now(); // Needed for selection animation

        const halfSize = this.size / 2;
        const drawX = this.x - halfSize;
        const drawY = this.y - halfSize;

        // --- Draw Ground Glow --- (if applicable)
        // ...

        // --- Draw Unit Body ---
        ctx.fillStyle = this.color;
        ctx.fillRect(drawX, drawY, this.size, this.size);

        // --- Draw Darker Border ---
        ctx.strokeStyle = getDarkerHslColor(this.color, 20);
        ctx.lineWidth = 2; // Increased unit border thickness
        ctx.strokeRect(drawX, drawY, this.size, this.size);

        // --- Draw Animated Selection --- (Modified)
        if (isSelected && this.playerId === currentPlayerId) {
             // Save context state
            const originalDash = ctx.getLineDash();
            const originalOffset = ctx.lineDashOffset;
            const originalWidth = ctx.lineWidth;
            const originalStroke = ctx.strokeStyle;

            // Calculate animation offset
            const dashOffset = -(now * SELECTION_ANIMATION_SPEED) % (SELECTION_DASH_PATTERN[0] + SELECTION_DASH_PATTERN[1]);

            ctx.strokeStyle = this.color; // Use player color
            ctx.lineWidth = SELECTION_LINE_WIDTH_UNIT; // Use new thickness
            ctx.setLineDash(SELECTION_DASH_PATTERN);
            ctx.lineDashOffset = dashOffset;

            const padding = 3;
            ctx.strokeRect(
                drawX - padding,
                drawY - padding,
                this.size + padding * 2,
                this.size + padding * 2
            );

             // Restore context state
            ctx.setLineDash(originalDash);
            ctx.lineDashOffset = originalOffset;
            ctx.lineWidth = originalWidth;
            ctx.strokeStyle = originalStroke;
        }
    }

    getUIDrawCommands(isSelected) {
        const commands = [];
        if (this.health <= 0) return commands;

        const now = performance.now(); // Needed for rotation offset
        const halfSize = this.size / 2;

        // Health Bar command
        commands.push({
            type: 'text',
            content: this.health,
            x: this.x,
            y: this.y - halfSize - 5,
            color: HEALTH_BAR_COLOR,
            font: HEALTH_BAR_FONT,
            textAlign: 'center'
        });

        // Attack Range Indicator command
        if (isSelected && this.playerId === currentPlayerId && isAMoveMode) {
            // Calculate rotation offset based on time
            const dashOffset = -(now * ROTATION_SPEED_FACTOR) % (DASH_PATTERN[0] + DASH_PATTERN[1]);

            commands.push({
                type: 'rangeCircle',
                x: this.x,
                y: this.y,
                radius: this.attackRange + halfSize, // Draw from edge
                // Use player color with reduced alpha for transparency
                color: players[this.playerId].color.replace(')', ', 0.4)').replace('hsl', 'hsla'),
                lineDash: DASH_PATTERN,
                lineDashOffset: dashOffset
            });
        }

        return commands;
    }

    update(now, allGameObjects) {
        if (this.health <= 0) { this.commandState = 'idle'; return; }
        if (this.targetUnit && this.targetUnit.health <= 0) {
             this.targetUnit = null;
             if (this.commandState === 'attacking') { this.commandState = 'idle'; }
        }
         switch (this.commandState) {
             case 'idle': break;
             case 'moving':
                 this.targetUnit = null;
                 this.performMovement();
                 if (this.x === this.targetX && this.y === this.targetY) { this.commandState = 'idle'; }
                 break;
             case 'attacking':
                 if (!this.targetUnit) { this.commandState = 'idle'; break; }
                 this.handleCombat(now, this.targetUnit);
                 break;
             case 'attackMoving':
                 if (this.targetUnit) {
                     this.handleCombat(now, this.targetUnit);
                 } else {
                     const enemy = findNearestEnemyInRange(this, this.targetAcquisitionRange, allGameObjects);
                     if (enemy) {
                         this.targetUnit = enemy;
                         this.handleCombat(now, this.targetUnit);
                     } else {
                         this.targetX = this.aMoveTargetX;
                         this.targetY = this.aMoveTargetY;
                         this.performMovement();
                         if (this.x === this.aMoveTargetX && this.y === this.aMoveTargetY) { this.commandState = 'idle'; }
                     }
                 }
                 break;
         }
    }

    handleCombat(now, target) {
        const dx = target.x - this.x;
        const dy = target.y - this.y;
        const distanceToTarget = Math.hypot(dx, dy);
        const combinedHalfSizes = this.size / 2 + target.size / 2;
        const effectiveAttackRange = this.attackRange + combinedHalfSizes;

        if (distanceToTarget <= effectiveAttackRange) {
            this.targetX = this.x;
            this.targetY = this.y;
            const timeSinceLastAttack = now - this.lastAttackTime;
            if (timeSinceLastAttack >= this.attackCooldown) {
                target.takeDamage(this.attackDamage);
                this.lastAttackTime = now;

                // Add laser effect (with color)
                attackEffects.push({
                    type: 'laser',
                    startX: this.x,
                    startY: this.y,
                    endX: target.x,
                    endY: target.y,
                    color: this.color, // Use unit's color
                    timestamp: now
                });

                // Add spark burst effect at target
                attackEffects.push({
                    type: 'burst',
                    x: target.x,
                    y: target.y,
                    color: SPARK_BURST_COLOR,
                    timestamp: now
                });
            }
        } else {
            this.targetX = target.x;
            this.targetY = target.y;
            this.performMovement();
        }
    }

    // Helper for standard movement towards targetX, targetY
    performMovement() {
        if (this.x === this.targetX && this.y === this.targetY) return; // Already there

        const dx = this.targetX - this.x;
        const dy = this.targetY - this.y;
        const distance = Math.hypot(dx, dy);

        let finalX, finalY;

        if (distance <= this.speed) {
            // Arrived at target
            finalX = this.targetX;
            finalY = this.targetY;
        } else {
            // Move one step towards target
            const moveX = (dx / distance) * this.speed;
            const moveY = (dy / distance) * this.speed;
            finalX = this.x + moveX;
            finalY = this.y + moveY;
        }

        // --- Clamp position to map boundaries (using unit edges) ---
        const halfSize = this.size / 2;
        finalX = Math.max(halfSize, Math.min(MAP_WIDTH - halfSize, finalX));
        finalY = Math.max(halfSize, Math.min(MAP_HEIGHT - halfSize, finalY));
        // --- End Clamp ---

        this.x = finalX;
        this.y = finalY;
    }

    moveTo(targetX, targetY) {
        this.commandState = 'moving';
        this.targetUnit = null;
        this.targetX = targetX;
        this.targetY = targetY;
        this.aMoveTargetX = targetX;
        this.aMoveTargetY = targetY;
    }

    attackMoveTo(targetX, targetY) {
        this.commandState = 'attackMoving';
        this.targetUnit = null;
        this.aMoveTargetX = targetX;
        this.aMoveTargetY = targetY;
        this.targetX = targetX;
        this.targetY = targetY;
    }

    attackUnit(target) {
        this.commandState = 'attacking';
        this.targetUnit = target;
    }

    isUnderPoint(pointX, pointY) {
        const halfSize = this.size / 2;
        return (pointX >= this.x - halfSize && pointX <= this.x + halfSize && pointY >= this.y - halfSize && pointY <= this.y + halfSize);
    }

    takeDamage(damageAmount) {
        this.health -= damageAmount;
        if (this.health < 0) this.health = 0;
    }
}

// --- Initialization ---
function setupGame() {
    gameObjects.length = 0;
    selectedUnits = [];
    Object.keys(players).forEach(id => { players[id].currentSupply = 0; });

    const cornerPadding = 80; // Bring bunkers closer
    // Player 1 (Top Left)
    gameObjects.push(new Bunker(cornerPadding, cornerPadding, 1));
    // Player 2 (Top Right)
    gameObjects.push(new Bunker(MAP_WIDTH - cornerPadding, cornerPadding, 2));
    // Player 3 (Bottom Left)
    gameObjects.push(new Bunker(cornerPadding, MAP_HEIGHT - cornerPadding, 3));
    // Player 4 (Bottom Right)
    gameObjects.push(new Bunker(MAP_WIDTH - cornerPadding, MAP_HEIGHT - cornerPadding, 4));

    switchPlayer(1);
}

// --- Player Control ---
const playerBtns = {
    1: document.getElementById('player1Btn'),
    2: document.getElementById('player2Btn'),
    3: document.getElementById('player3Btn'),
    4: document.getElementById('player4Btn')
};

function switchPlayer(newPlayerId) {
    if (newPlayerId < 1 || newPlayerId > 4) return;
    currentPlayerId = newPlayerId;
    isAMoveMode = false;
    selectedUnits = []; // Clear selection
    Object.values(playerBtns).forEach(btn => btn.classList.remove('active'));
    if (playerBtns[currentPlayerId]) playerBtns[currentPlayerId].classList.add('active');
    console.log(`Switched to Player ${currentPlayerId}`);
}

playerBtns[1].addEventListener('click', () => switchPlayer(1));
playerBtns[2].addEventListener('click', () => switchPlayer(2));
playerBtns[3].addEventListener('click', () => switchPlayer(3));
playerBtns[4].addEventListener('click', () => switchPlayer(4));

// --- Input Handling ---
window.addEventListener('keydown', handleKeyDown);
canvas.addEventListener('contextmenu', handleRightClick);

function handleKeyDown(event) {
    const key = event.key.toUpperCase();
    if (key === 'A') {
        if (selectedUnits.some(unit => unit.type === 'unit' && unit.playerId === currentPlayerId)) {
             isAMoveMode = true; console.log("A-Move mode activated");
        }
     } else if (key >= '1' && key <= '4') {
         switchPlayer(parseInt(key));
     } else if (key === 'ESCAPE') {
         isAMoveMode = false;
     }
}

function getMousePos(event) {
    const rect = canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
}

canvas.addEventListener('mousedown', handleMouseDown);
canvas.addEventListener('mousemove', handleMouseMove);
canvas.addEventListener('mouseup', handleMouseUp);

function handleMouseDown(event) {
    if (event.button === 0 && !isAMoveMode) {
        isDragging = true;
        const mousePos = getMousePos(event);
        dragStartX = mousePos.x;
        dragStartY = mousePos.y;
        dragEndX = dragStartX;
        dragEndY = dragStartY;
        // Deselect on mousedown BEFORE checking click/drag type in mouseup
        selectedUnits = [];
    }
}

function handleMouseMove(event) {
    if (isDragging) {
        const mousePos = getMousePos(event);
        dragEndX = mousePos.x;
        dragEndY = mousePos.y;
    }
}

function handleMouseUp(event) {
    const mousePos = getMousePos(event);

    // A-Move Command
    if (event.button === 0 && isAMoveMode) {
        const commandableUnits = selectedUnits.filter(obj => obj.type === 'unit' && obj.playerId === currentPlayerId);
        if (commandableUnits.length > 0) {
            console.log(`A-Move command to ${mousePos.x}, ${mousePos.y}`);
            commandableUnits.forEach(unit => unit.attackMoveTo(mousePos.x, mousePos.y));
            // Add an A-Move marker
            movementMarkers.push({
                x: mousePos.x,
                y: mousePos.y,
                timestamp: performance.now(),
                playerId: currentPlayerId, // Still useful for context, though color is fixed
                isAttackMove: true // Flag this marker type
            });
        }
        isAMoveMode = false;
        isDragging = false;
        return;
    }
    if (event.button === 0 && isDragging) {
        isDragging = false;
        const dragDistance = Math.hypot(dragEndX - dragStartX, dragEndY - dragStartY);
        let objectsInSelection = [];
        if (dragDistance < CLICK_DRAG_THRESHOLD) { // Click Selection
            let clickedObject = null;
            for (let i = gameObjects.length - 1; i >= 0; i--) {
                const obj = gameObjects[i];
                if (obj.health > 0 && obj.isUnderPoint(mousePos.x, mousePos.y)) {
                    // Prioritize selecting own units/bunkers for the current player
                    if (obj.playerId === currentPlayerId) { clickedObject = obj; break; }
                }
            }
            if (clickedObject) objectsInSelection.push(clickedObject);
        } else { // Drag Selection
            const rect = { x: Math.min(dragStartX, dragEndX), y: Math.min(dragStartY, dragEndY),
                         width: Math.abs(dragEndX - dragStartX), height: Math.abs(dragEndY - dragStartY) };
            gameObjects.forEach(obj => {
                if (obj.health > 0 && obj.playerId === currentPlayerId && isUnitInRect(obj, rect)) {
                    objectsInSelection.push(obj);
                }
            });
        }
        selectedUnits = objectsInSelection.filter(obj => obj.type === 'unit' || obj.type === 'bunker');
    }
    if (isAMoveMode && event.button !== 0) isAMoveMode = false;
}

function handleRightClick(event) {
    event.preventDefault();
    isAMoveMode = false;

    const commandableUnits = selectedUnits.filter(obj => obj.type === 'unit' && obj.playerId === currentPlayerId);
    const selectedPlayerBunkers = selectedUnits.filter(obj => obj.type === 'bunker' && obj.playerId === currentPlayerId);

    if (commandableUnits.length === 0 && selectedPlayerBunkers.length === 0) return;

    const clickPos = getMousePos(event);
    let clickedTarget = null; // Enemy target
    for (let i = gameObjects.length - 1; i >= 0; i--) {
        const obj = gameObjects[i];
        if (obj.health > 0 && obj.playerId !== currentPlayerId && obj.isUnderPoint(clickPos.x, clickPos.y)) {
            clickedTarget = obj; break;
        }
    }

    let issuedMoveCommand = false;
    // Command units
    if (commandableUnits.length > 0) {
        commandableUnits.forEach(unit => {
            if (clickedTarget) { unit.attackUnit(clickedTarget); }
            else { unit.moveTo(clickPos.x, clickPos.y); issuedMoveCommand = true; }
        });
    }
    // Command bunkers (set rally point)
    if (selectedPlayerBunkers.length > 0) {
        if (!clickedTarget) { // Only set rally on ground click
             console.log("Setting Rally Point");
             selectedPlayerBunkers.forEach(bunker => { bunker.rallyPoint = { x: clickPos.x, y: clickPos.y }; });
             issuedMoveCommand = false; // No move marker for rally set
        }
    }
    if (issuedMoveCommand) {
        // Add a regular move marker (no isAttackMove flag)
        movementMarkers.push({
            x: clickPos.x,
            y: clickPos.y,
            timestamp: performance.now(),
            playerId: currentPlayerId
        });
    }
}

// --- Helper Functions ---
function findNearestEnemyInRange(unit, range, allGameObjects) {
    let nearestEnemy = null;
    let minDistanceSq = range * range;
    for (const otherObj of allGameObjects) {
        if (unit === otherObj || otherObj.health <= 0 || otherObj.playerId === unit.playerId) continue;
        const dx = otherObj.x - unit.x;
        const dy = otherObj.y - unit.y;
        const distanceSq = dx * dx + dy * dy;
        const combinedHalfSizes = unit.size / 2 + otherObj.size / 2;
        const effectiveRange = range + combinedHalfSizes;
        const effectiveRangeSq = effectiveRange * effectiveRange;
        if (distanceSq <= effectiveRangeSq && distanceSq < minDistanceSq) {
             minDistanceSq = distanceSq;
             nearestEnemy = otherObj;
        }
    }
    return nearestEnemy;
}

function isUnitInRect(unit, rect) {
    const halfSize = unit.size / 2;
    const unitLeft = unit.x - halfSize;
    const unitRight = unit.x + halfSize;
    const unitTop = unit.y - halfSize;
    const unitBottom = unit.y + halfSize;
    const rectLeft = rect.x;
    const rectRight = rect.x + rect.width;
    const rectTop = rect.y;
    const rectBottom = rect.y + rect.height;
    return (unitLeft < rectRight && unitRight > rectLeft && unitTop < rectBottom && unitBottom > rectTop);
}

function checkUnitCollision(objA, objB) {
    if (objA === objB || objA.health <= 0 || objB.health <= 0) return false;
    const halfSizeA = objA.size / 2;
    const leftA = objA.x - halfSizeA;
    const rightA = objA.x + halfSizeA;
    const topA = objA.y - halfSizeA;
    const bottomA = objA.y + halfSizeA;
    const halfSizeB = objB.size / 2;
    const leftB = objB.x - halfSizeB;
    const rightB = objB.x + halfSizeB;
    const topB = objB.y - halfSizeB;
    const bottomB = objB.y + halfSizeB;
    return (leftA < rightB && rightA > leftB && topA < bottomB && bottomA > topB);
}

// --- Collision Resolution ---
function resolveUnitCollisions(allGameObjects) {
    const PUSH_FACTOR = 0.5;
    const BUNKER_PUSH_FACTOR = 0.1;
    for (let i = 0; i < allGameObjects.length; i++) {
        for (let j = i + 1; j < allGameObjects.length; j++) {
            const objA = allGameObjects[i];
            const objB = allGameObjects[j];
            if (objA.health <= 0 || objB.health <= 0 || (objA.type === 'bunker' && objB.type === 'bunker')) continue;
            if (checkUnitCollision(objA, objB)) {
                 const dx = objB.x - objA.x;
                 const dy = objB.y - objA.y;
                 let distance = Math.hypot(dx, dy);
                 if (distance === 0) {
                     distance = 0.1;
                     if (objA.type === 'unit') { objA.x += (Math.random() - 0.5) * 0.2; objA.y += (Math.random() - 0.5) * 0.2; }
                     if (objB.type === 'unit') { objB.x += (Math.random() - 0.5) * 0.2; objB.y += (Math.random() - 0.5) * 0.2; }
                 }
                 const overlap = (objA.size / 2 + objB.size / 2) - distance;
                 if (overlap > 0) {
                     const separationX = dx / distance;
                     const separationY = dy / distance;
                     let pushA = PUSH_FACTOR;
                     let pushB = PUSH_FACTOR;
                     if (objA.type === 'bunker') pushA = BUNKER_PUSH_FACTOR;
                     if (objB.type === 'bunker') pushB = BUNKER_PUSH_FACTOR;
                     const totalPush = overlap;
                     const massRatioA = pushB / (pushA + pushB);
                     const massRatioB = pushA / (pushA + pushB);
                     if (objA.type === 'unit') { objA.x -= separationX * totalPush * massRatioA; objA.y -= separationY * totalPush * massRatioA; }
                     if (objB.type === 'unit') { objB.x += separationX * totalPush * massRatioB; objB.y += separationY * totalPush * massRatioB; }
                 }
            }
        }
    }
}

// --- Drawing Functions ---
function drawBackground(ctx) {
    for(let y=0;y<canvas.height;y+=CHECKER_SIZE)for(let x=0;x<canvas.width;x+=CHECKER_SIZE){const iECol=Math.floor(x/CHECKER_SIZE)%2===0;const iERow=Math.floor(y/CHECKER_SIZE)%2===0;ctx.fillStyle=(iERow===iECol)?BACKGROUND_COLOR_1:BACKGROUND_COLOR_2;ctx.fillRect(x,y,CHECKER_SIZE,CHECKER_SIZE);}
}

function drawSelectionRect(ctx) {
    if(!isDragging||isAMoveMode)return;ctx.strokeStyle=SELECTION_COLOR;ctx.lineWidth=1;ctx.setLineDash([5,5]);ctx.strokeRect(dragStartX,dragStartY,dragEndX-dragStartX,dragEndY-dragStartY);ctx.setLineDash([]);
}

function drawRippleEffect(ctx, now, x, y, progress, color, startRadius, ringCount, lineWidth) {
    // Make alpha fade slower (e.g., 1.0 down to 0.3)
    const baseAlpha = Math.max(0, 0.3 + 0.7 * (1.0 - progress));

    if (baseAlpha <= 0) return;

    ctx.lineWidth = lineWidth; // Apply line width
    const originalDash = ctx.getLineDash();
    const originalOffset = ctx.lineDashOffset;

    const dashOffset = -(now * RIPPLE_ROTATION_SPEED) % (RIPPLE_DASH_PATTERN[0] + RIPPLE_DASH_PATTERN[1]);
    ctx.setLineDash(RIPPLE_DASH_PATTERN);
    ctx.lineDashOffset = dashOffset;

    for (let i = 0; i < ringCount; i++) {
        const ringStartProgress = i * RIPPLE_RING_DELAY_FACTOR;
        if (progress < ringStartProgress) continue;
        const ringEffectiveDuration = 1.0 - ringStartProgress;
        if (ringEffectiveDuration <= 0) continue;
        const ringEffectiveProgress = Math.min(1.0, (progress - ringStartProgress) / ringEffectiveDuration);
        const currentRadius = startRadius * (1.0 - ringEffectiveProgress);

        // Use the modified baseAlpha directly, no per-ring alpha fade needed
        const finalAlpha = baseAlpha;
        if (currentRadius <= 0 || finalAlpha <= 0) continue;

        // Get player color and apply final alpha
        let rgbaColor = color;
        if (color.startsWith('hsl')) {
            rgbaColor = color.replace(')', `, ${finalAlpha.toFixed(3)})`).replace('hsl', 'hsla');
        } else {
            // Handle explicit 'red' for A-move marker - now handled via A_MOVE_MARKER_COLOR constant which is HSL
            // if (color === 'red') {
            //      rgbaColor = `rgba(255, 0, 0, ${finalAlpha.toFixed(3)})`;
            // } else {
            //      rgbaColor = `rgba(200, 200, 200, ${finalAlpha.toFixed(3)})`; // Fallback
            // }
            // Improved fallback or handling for non-HSL might be needed if other colors are used
            rgbaColor = `rgba(200, 200, 200, ${finalAlpha.toFixed(3)})`; // Fallback for now
        }

        // --- Draw the hollow, dotted SQUARE ---
        ctx.strokeStyle = rgbaColor;
        // Calculate square properties based on radius
        const sideLength = currentRadius * 2;
        const topLeftX = x - currentRadius;
        const topLeftY = y - currentRadius;
        // Draw the square instead of arc
        ctx.strokeRect(topLeftX, topLeftY, sideLength, sideLength);
        /* // Original circle drawing code:
        ctx.beginPath();
        ctx.arc(x, y, currentRadius, 0, Math.PI * 2);
        ctx.stroke();
        */
    }

    // Restore original dash settings
    ctx.setLineDash(originalDash);
    ctx.lineDashOffset = originalOffset;
}

function drawMovementMarkers(ctx, now) {
    for (let i = movementMarkers.length - 1; i >= 0; i--) {
        const marker = movementMarkers[i];
        const elapsedTime = now - marker.timestamp;

        // Use MOVEMENT_MARKER_DURATION for both types now
        if (elapsedTime >= MOVEMENT_MARKER_DURATION) {
            movementMarkers.splice(i, 1);
            continue;
        }

        const progress = elapsedTime / MOVEMENT_MARKER_DURATION;

        // Determine color and ring count based on marker type
        const isAttackMove = marker.isAttackMove === true;
        const markerColor = isAttackMove ? A_MOVE_MARKER_COLOR : (players[marker.playerId]?.color || 'white');
        const ringCount = isAttackMove ? A_MOVE_RIPPLE_RING_COUNT : RIPPLE_RING_COUNT;

        // Use the ripple function with determined parameters
        drawRippleEffect(
            ctx,
            now,
            marker.x, marker.y,
            progress,
            markerColor,
            MOVEMENT_MARKER_START_RADIUS * RIPPLE_START_RADIUS_FACTOR,
            ringCount,
            RIPPLE_LINE_WIDTH // Pass line width
        );
    }
}

// --- Rendering Functions ---
function executeDrawCommand(ctx, command) {
    const now = performance.now();
    switch (command.type) {
        case 'text':
            ctx.fillStyle = command.color || 'white';
            ctx.font = command.font || '10px Arial';
            ctx.textAlign = command.textAlign || 'center';
            ctx.fillText(command.content, command.x, command.y);
            break;
        case 'rally':
            const originalRallyDash = ctx.getLineDash();
            const originalRallyOffset = ctx.lineDashOffset;
            const originalRallyLineWidth = ctx.lineWidth;
            const originalRallyStrokeStyle = ctx.strokeStyle;
            ctx.strokeStyle = command.color || 'lime';
            ctx.lineWidth = command.lineWidth || 1;
            if (command.lineDash) ctx.setLineDash(command.lineDash);
            if (command.lineDashOffset !== undefined) ctx.lineDashOffset = command.lineDashOffset;
            ctx.beginPath();
            ctx.moveTo(command.startX, command.startY);
            ctx.lineTo(command.endX, command.endY);
            ctx.stroke();
            ctx.setLineDash(originalRallyDash);
            ctx.lineDashOffset = originalRallyOffset;

            // --- Draw Looping Rally Ripple Marker ---
            const pulseTime = now % command.pulseDuration;
            const pulseProgress = pulseTime / command.pulseDuration;
            const playerColor = players[command.playerId]?.color || 'lime';

            drawRippleEffect(
                ctx,
                now,
                command.endX, command.endY,
                pulseProgress,
                playerColor,
                command.rippleStartRadius,
                RIPPLE_RING_COUNT,
                RIPPLE_LINE_WIDTH // Pass line width
            );

            // ... (Restore context state) ...
            ctx.lineWidth = originalRallyLineWidth;
            ctx.strokeStyle = originalRallyStrokeStyle;
            break;
        case 'rangeCircle':
            const originalDash = ctx.getLineDash();
            const originalOffset = ctx.lineDashOffset;

            ctx.strokeStyle = command.color || 'rgba(255,0,0,0.3)';
            ctx.lineWidth = 1;
            if (command.lineDash) {
                ctx.setLineDash(command.lineDash);
            }
            if (command.lineDashOffset) {
                ctx.lineDashOffset = command.lineDashOffset;
            }
            ctx.beginPath();
            ctx.arc(command.x, command.y, command.radius, 0, Math.PI * 2);
            ctx.stroke();

            // Reset dash properties
            ctx.setLineDash(originalDash);
            ctx.lineDashOffset = originalOffset;
            break;
    }
}

function drawAttackEffects(ctx, now) {
    ctx.globalAlpha = 0.8;

    for (let i = attackEffects.length - 1; i >= 0; i--) {
        const effect = attackEffects[i];

        // Laser Effect
        if (effect.type === 'laser') {
            if (now - effect.timestamp > ATTACK_EFFECT_DURATION) {
                attackEffects.splice(i, 1);
                continue;
            }
            ctx.strokeStyle = effect.color || ATTACK_EFFECT_COLOR; // Use effect's color
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(effect.startX, effect.startY);
            ctx.lineTo(effect.endX, effect.endY);
            ctx.stroke();
        }
        // Spark Burst Effect
        else if (effect.type === 'burst') {
            if (now - effect.timestamp > SPARK_BURST_DURATION) {
                attackEffects.splice(i, 1);
                continue;
            }
            ctx.strokeStyle = effect.color || SPARK_BURST_COLOR;
            ctx.lineWidth = 1;
            // Draw several short lines radiating out
            for(let j = 0; j < SPARK_COUNT; j++) {
                const angle = (j / SPARK_COUNT) * Math.PI * 2 + (now * 0.01); // Add slight rotation
                const startX = effect.x;
                const startY = effect.y;
                const endX = effect.x + Math.cos(angle) * SPARK_LENGTH;
                const endY = effect.y + Math.sin(angle) * SPARK_LENGTH;
                ctx.beginPath();
                ctx.moveTo(startX, startY);
                ctx.lineTo(endX, endY);
                ctx.stroke();
            }
        }
    }
    ctx.globalAlpha = 1.0; // Reset alpha
}

// Simple game loop
function gameLoop() {
    const now = performance.now();
    context.clearRect(0, 0, canvas.width, canvas.height);
    drawBackground(context);

    // 1. Update game object states
    gameObjects.forEach(obj => {
        if (obj.update) {
            if (obj.type === 'bunker') {
                if (typeof obj.update === 'function') {
                    obj.update(now, gameObjects, players);
                }
            } else if (obj.type === 'unit') {
                if (typeof obj.update === 'function') {
                    obj.update(now, gameObjects);
                }
            }
        }
    });

    // 2. Resolve collisions
    resolveUnitCollisions(gameObjects);

    // Safety clamp after collisions
    gameObjects.forEach(obj => {
        if (obj.type === 'unit') { // Only clamp units
            const halfSize = obj.size / 2;
            obj.x = Math.max(halfSize, Math.min(MAP_WIDTH - halfSize, obj.x));
            obj.y = Math.max(halfSize, Math.min(MAP_HEIGHT - halfSize, obj.y));
        }
    });

    // 3. Handle deaths and target cleanup + Supply Update
    const livingObjects = [];
    gameObjects.forEach(obj => {
        if (obj.health > 0) {
            livingObjects.push(obj);
        } else {
            // Object died
            console.log(`${obj.type} ${obj.id} belonging to Player ${obj.playerId} died.`);
            if (obj.type === 'unit') {
                const playerState = players[obj.playerId];
                if (playerState) {
                     playerState.currentSupply = Math.max(0, playerState.currentSupply - obj.supplyCost);
                     console.log(`Player ${obj.playerId} supply decreased. New supply: ${playerState.currentSupply}/${playerState.supplyCap}`);
                 }
                selectedUnits = selectedUnits.filter(selected => selected.id !== obj.id);
            }
            gameObjects.forEach(attacker => {
                if (attacker.targetUnit && attacker.targetUnit.id === obj.id) {
                    attacker.targetUnit = null;
                    if (attacker.commandState === 'attacking') attacker.commandState = 'idle';
                }
            });
        }
    });
    gameObjects.length = 0;
    gameObjects.push(...livingObjects);
    gameObjects.forEach(obj => {
        if (obj.targetUnit && obj.targetUnit.health <= 0) {
            obj.targetUnit = null;
            if (obj.commandState === 'attacking') obj.commandState = 'idle';
        }
    });

    // --- Rendering ---
    const uiDrawQueue = [];

    // Pass 1: Draw bodies and collect UI commands
    gameObjects.forEach(obj => {
        const isSelected = selectedUnits.some(sel => sel.id === obj.id);
        if (obj.drawBody) obj.drawBody(context, isSelected);
        if (obj.getUIDrawCommands) {
            uiDrawQueue.push(...obj.getUIDrawCommands(isSelected));
        }
    });

    // Draw Attack Effects (after bodies, before UI?)
    drawAttackEffects(context, now);

    // Pass 2: Draw UI elements from the queue
    // Reset context properties that might interfere
    context.textAlign = 'center'; // Default for most UI text
    uiDrawQueue.forEach(command => executeDrawCommand(context, command));

    // Draw other non-queued UI (selection rect, move markers)
    drawSelectionRect(context);
    drawMovementMarkers(context, now);

    requestAnimationFrame(gameLoop);
}

// --- Initial Setup ---
window.addEventListener('load', () => {
    // No need to call resizeCanvas anymore
    // resizeCanvas();
    setupGame();
    gameLoop();
}); 
