/**
 * Don't hate this guy, hate the game.
 */
class Player {
    constructor() {
        this.turn = 0;
        this.warrior = new SmartWarrior();
        this.prevUnitAhead = null;
        this.prevUnitBehind = null;
    }

    playTurn(gameWarrior) {
        // Model update and other bookkeeping.
        ++this.turn;
        const warrior = this.warrior.update(gameWarrior);

        warrior.think(`I took ${warrior.damageTaken()} damage last turn.`);
        this.warrior.thinkAboutMentalMap();

        const unitAhead = findFirstUnit(warrior.mentalMap, 'forward');
        const unitBehind = findFirstUnit(warrior.mentalMap, 'backward');

        detectUnitTypes(
            warrior,
            unitAhead,
            unitBehind,
            this.prevUnitAhead,
            this.prevUnitBehind
        );

        this.prevUnitAhead = unitAhead;
        this.prevUnitBehind = unitBehind;

        // When my health is very low, I walk backward to safety (if it's indeed safe behind me) and heal myself next turn.
        if (
            warrior.health() < 4
            && warrior.damageTaken()
            && (!unitBehind || !unitBehind.unit.isEnemy() || unitBehind.dist > 4)
            && unitAhead
            && unitAhead.unit.attackRangeMax() >= unitAhead.dist
        ) {
            // If I can kill the enemy in one hit, I stay put and attack.
            if (unitAhead.unit.health() <= 5 && unitAhead.dist <= 1) {
                warrior.attack();
                return;
            } else if (unitAhead.unit.health() <= 3 && unitAhead.dist <= 3) {
                warrior.shoot();
                return;
            } else {
                warrior.walk('backward');
                return;
            }
        }

        // When my health is low and i'm safe, I heal up.
        const areaCompletedBackward = warrior.mentalMap.isCompleted('backward');
        const enemiesAlive = enemyMightBeAlive(warrior.mentalMap);
        const dangerousEnemyAhead = unitAhead
            && unitAhead.unit.attackRangeMax() >= unitAhead.dist;

        if (
            warrior.health() < 7
            && !warrior.damageTaken()
            && !dangerousEnemyAhead
            && enemiesAlive
        ) {
            warrior.rest();
            return;
        }

        // Check whether I can see a wall behind me but no stairs.
        // If so and there's something interesting behind me, I pivot and do that part of the area first.
        const backWalk = warrior.mentalMap.mentalWalk();
        let square = null;
        let foundSomething = false;

        while (square = backWalk.backward()) {
            if (square.isUnit()) {
                foundSomething = true;
            } else if (square.isStairs()) {
                break;
            } else if (square.isWall() && foundSomething) {
                warrior.pivot();
                return;
            }
        }

        // Check the squares ahead.
        const walk = warrior.mentalMap.mentalWalk();
        let dist = 0;
        let firstUnit = null;
        let firstUnitDist = null;
        let enemiesAhead = 0;

        while ((square = walk.forward())) {
            ++dist;

            // Detect captives and enemies.
            if (square.isUnit()) {
                const unit = square.getUnit();

                if (!firstUnit) {
                    firstUnit = unit;
                    firstUnitDist = dist;
                }

                if (unit.isEnemy()) {
                    ++enemiesAhead;
                }
            }

            // If I get this far and I find a wall or stairs but I haven't completed the area yet I pivot and kick more ass.
            if (!firstUnit) {
                if (square.isStairs()) {
                    if (areaCompletedBackward) {
                        break;
                    } else {
                        warrior.pivot();
                        return;
                    }
                } else if (square.isWall()) {
                    warrior.pivot();
                    return;
                }
            }
        }

        // Deal with captives and enemies.
        if (firstUnit) {
            if (firstUnitDist === 1) {
                // I attack enemies and rescue captives in front of me.
                if (firstUnit.isBound()) {
                    warrior.rescue();
                    return;
                } else if (firstUnit.isEnemy()) {
                    warrior.attack();
                    return;
                }
            } else if (firstUnitDist === 2) {
                // I attack nearby ranged enemies.
                if (firstUnit.isEnemy()) {
                    if (firstUnit.attackDamageMax() > 3
                        && firstUnit.attackRangeMax() >= firstUnitDist) {
                        warrior.think("The next enemy might be a wizard, I'll shoot it from a distance.");
                        warrior.shoot();
                        return;
                    } else if (firstUnit.attackRangeMax() <= 1
                        && warrior.health() < 10) {
                        warrior.think("There are too many enemies ahead, I'll kill them from a distance.");
                        warrior.shoot();
                        return;
                    }
                }
            } else if (firstUnitDist === 3) {
                // I shoot nearby ranged enemies.
                if (firstUnit.isEnemy()) {
                    if (firstUnit.attackRangeMax() > 1) {
                        warrior.think("This enemy might hit me from afar, I'll kill it from a distance.");
                        warrior.shoot();
                        return;
                    } else if (warrior.health() < 10) {
                        warrior.think("There are too many enemies ahead, I'll kill them from a distance.");
                        warrior.shoot();
                        return;
                    }
                }
            }
        }

        warrior.walk();
    }
}

/**
 * What's trying to murder me and what are its properties?
 * Let's do an ethological study.
 */
function detectUnitTypes(
    warrior, unitAhead, unitBehind, prevUnitAhead, prevUnitBehind) {
    const closeUnits = [];

    // Check whether an enemy just died or a captive was just rescued infront of the nearest enemies, in that case I can't say whether they've tried to hit me.
    if (unitAhead
        && (!prevUnitAhead || unitAhead.unit === prevUnitAhead.unit)) {
        closeUnits.push(unitAhead);
    }

    if (unitBehind
        && (!prevUnitBehind || unitBehind.unit === prevUnitBehind.unit)) {
        closeUnits.push(unitBehind);
    }

    const lastMove = warrior.moves[warrior.moves.length - 1];

    // If I haven't made a move yet or I only just walked within range I can't be sure whether the enemies attack or not.
    if (lastMove && lastMove.type !== 'walk') {
        if (closeUnits.length === 1) {
            closeUnits[0].unit.itAttacksFromDist(
                warrior.damageTaken() > 0,
                warrior.damageTaken(),
                closeUnits[0].dist
            );
        } else if (warrior.damageTaken() === 0) {
            closeUnits.forEach(({ unit, dist }) => {
                unit.itAttacksFromDist(
                    warrior.damageTaken() > 0,
                    warrior.damageTaken(),
                    dist
                );
            });
        } else if (warrior.damageTaken() === 6) {
            closeUnits.forEach(({ unit, dist }) => {
                unit.itAttacksFromDist(true, 3, dist);
            });
        } else if (warrior.damageTaken() > 6) {
            closeUnits.forEach(({ unit, dist }) => {
                unit.itAttacksFromDist(true, null, dist);
            });
        }
    }

    if (unitAhead) {
        thinkAboutUnit(warrior, unitAhead, 'ahead of');
    }

    if (unitBehind) {
        thinkAboutUnit(warrior, unitBehind, 'behind');
    }
}

function thinkAboutUnit(warrior, { unit, dist }, where) {
    const type = unit.type() || 'enemy';
    const aType = type[0] === 'a' || type[0] === 'e'
        ? `an ${type}`
        : `a ${type}`;
    warrior.think(`There is ${aType} ${dist} squares ${where} me with max attack range ${unit.attackRangeMax()}, max attack damage ${unit.attackDamageMax()}.`);
}

function findFirstUnit(mentalMap, relDir) {
    const walk = mentalMap.mentalWalk();
    let square = null;

    while (square = walk.walk(relDir)) {
        if (square.isUnit()) {
            return {
                unit: square.getUnit(),
                dist: Math.abs(mentalMap.curr.x - square.x)
            };
        }
    }
}

function enemyMightBeAlive(mentalMap) {
    let walk = mentalMap.mentalWalk();
    let square = null;
    let startFound = false;
    let endFound = false;

    while (square = walk.walk()) {
        if (square.isUnit() && square.getUnit().isEnemy()) {
            return true;
        } else if (square.isWall() || square.isStairs()) {
            endFound = true;
        }
    }

    walk = mentalMap.mentalWalk();

    while (square = walk.walk('backward')) {
        if (square.isUnit() && square.getUnit().isEnemy()) {
            return true;
        } else if (square.isWall() || square.isStairs()) {
            startFound = true;
        }
    }

    return !(startFound && endFound);
}

/**
 * Knows which direction he's travelling in, whether or not he's being shot at and other life-prolonging things.
 */
class SmartWarrior {
    constructor() {
        this.warrior = null;
        this.mentalMap = new MentalMap();
        this.moves = [];
    }

    update(warrior) {
        this.warrior = warrior;
        this._prevHealth = this._health;
        this._health = this.health();
        this._damageTaken = Math.max(
            0,
            (this._prevHealth || 20) - this._health
        );

        this.mentalMap.update(
            warrior.look('forward'), warrior.look('backward'));
        return this;
    }

    // Actions

    attack(relDir) {
        this.warrior.attack(relDir);

        const square = this.mentalMap.mentalWalk().walk(relDir);

        if (square.isUnit()) {
            square.getUnit().hurt(5);
        }

        this.moves.push({ type: 'attack', relDir });

        return this;
    }

    pivot(relDir) {
        this.warrior.pivot(relDir);

        if (relDir !== 'forward') {
            if (this.mentalMap.dir === 'right') {
                this.mentalMap.dir = 'left';
                this.mentalMap.oppDir = 'right';
            } else {
                this.mentalMap.dir = 'right';
                this.mentalMap.oppDir = 'left';
            }
        }

        this.moves.push({ type: 'pivot', relDir });

        return this;
    }

    rescue(relDir) {
        this.warrior.rescue(relDir);

        this.mentalMap.mentalWalk()
            .forward()
            .rescue();

        this.moves.push({ type: 'rescue', relDir });

        return this;
    }

    rest() {
        this.warrior.rest();
        this.moves.push({ type: 'rest' });
        return this;
    }

    shoot(relDir) {
        this.warrior.shoot(relDir);

        const walk = this.mentalMap.mentalWalk();

        let square = null;
        let i = 0;

        while ((square = walk.walk(relDir)) && i++ < 3) {
            if (square.isUnit()) {
                square.getUnit().hurt(3);
                break;
            }
        }

        this.moves.push({ type: 'shoot', relDir });

        return this;
    }

    walk(relDir) {
        this.warrior.walk(relDir);
        this.mentalMap.walk(relDir);
        this.moves.push({ type: 'walk', relDir });
        return this;
    }

    // Senses

    health() {
        return this.warrior.health();
    }

    damageTaken() {
        return this._damageTaken;
    }

    think(about) {
        this.warrior.think(`"${about}"`);
    }

    thinkAboutMentalMap() {
        const map = this.mentalMap.toString();
        this.think(`My mental map looks like this: ${map}`);
    }
}

/**
 * Mental map of the current area.
 */
class MentalMap {
    /**
     * Literally starts at square zero.
     */
    constructor() {
        this.dir = 'right';
        this.oppDir = 'left';
        this.curr = new Square(0);
    }

    /**
     * Don't forget to update at the start of your turn.
     * 
     * @param {[]} forwardLook an array of spaces from a warrior forward look
     * @param {[]} backwardLook an array of spaces from a warrior backward look
     */
    update(forwardLook, backwardLook) {
        this._update(this.dir, this.oppDir, forwardLook);
        this._update(this.oppDir, this.dir, backwardLook);
    }

    _update(dir, oppDir, lookSquares) {
        const xInc = dir === 'right' ? 1 : -1;
        let square = this.curr;

        for (const lookSquare of lookSquares) {
            let nextSquare = square[dir];

            if (nextSquare) {
                nextSquare.update(lookSquare);
            } else {
                nextSquare = new Square(square.x + xInc, lookSquare);
                nextSquare[oppDir] = square;

                square[dir] = nextSquare;
            }

            square = nextSquare;
        }
    }

    isCompleted(relDir) {
        const walk = this.mentalWalk();
        let square = null;

        while (square = walk.walk(relDir)) {
            if (square.isUnit()) {
                return false;
            }

            if (square.isStairs() || square.isWall()) {
                return true;
            }
        }

        return false;
    }

    walk(relDir) {
        const dir = relDir === 'backward' ? this.oppDir : this.dir;

        if (this.curr[dir] && this.curr[dir].isEmpty()) {
            this.curr = this.curr[dir];
        }
    }

    mentalWalk() {
        return new Walker(this);
    }

    toArray() {
        let arr = [this.curr];

        while (arr[0].left) {
            arr.unshift(arr[0].left);
        }

        while (arr[arr.length - 1].right) {
            arr.push(arr[arr.length - 1].right);
        }

        return arr;
    }

    toString() {
        return this.toArray()
            .map(sq => {
                if (this.curr == sq) {
                    return '@';
                } else if (sq.isUnit()) {
                    if (sq.getUnit().isEnemy()) {
                        return 'e';
                    } else if (sq.getUnit().isBound()) {
                        return 'C';
                    } else {
                        return 'X';
                    }
                } else if (sq.isStairs()) {
                    return '>';
                } else if (sq.isWall()) {
                    return '║';
                } else if (sq.rescuedUnits().length) {
                    return 'R';
                } else if (sq.deadUnits().length) {
                    return '✝';
                } else {
                    return ' ';
                }
            })
            .join('');
    }
}

/**
 * A single space on the map.
 */
class Square {
    constructor(x, space) {
        this.x = x;
        this._rescuedUnits = [];
        this._deadUnits = [];
        this.left = null;
        this.right = null;
        this.update(space);
    }

    update(space) {
        this.space = space;

        if (space) {
            if (space.isUnit()) {
                if (this._simulacrum) {
                    this._simulacrum.update(space.getUnit());
                } else {
                    this._simulacrum = new Simulacrum(space.getUnit(), this);
                }
            } else if (this.isUnit()) {
                if (this._simulacrum.isEnemy()) {
                    this._simulacrum.kill();
                } else {
                    this._simulacrum.rescue();
                }
            }
        }
    }

    rescue() {
        if (this._simulacrum && this._simulacrum.isBound()) {
            this._simulacrum.rescue();
        }
    }

    isUnit() {
        return this._simulacrum != null && this.space.isUnit();
    }

    rescuedUnits() {
        return this._rescuedUnits;
    }

    deadUnits() {
        return this._deadUnits;
    }

    getUnit() {
        return this._simulacrum;
    }

    isStairs() {
        return this.space && this.space.isStairs();
    }

    isWall() {
        return this.space && this.space.isWall();
    }

    isEmpty() {
        return this.space == null || this.space.isEmpty();
    }
}

/**
 * Simulates a unit.
 */
class Simulacrum {
    constructor(unit, square) {
        this._damage = 0;
        this._state = 'alive';
        this._square = square;
        this.update(unit);

        if (this.isEnemy()) {
            this._possibleTypes = new Set([
                'sludge',
                'thick-sludge',
                'archer',
                'wizard'
            ]);
            this._type = null;
            this._maxHealth = null;
            this._attacks = null;
            this._attackDamage = null;
            this._attackDamageMax = 11;
            this._attackRange = null;
            this._attackRangeMax = 3;
            this._doesntAttackLongRange = null;
        } else {
            this._possibleTypes = new Set([
                'captive'
            ]);
            this._type = 'captive';
            this._maxHealth = 1;
            this._attacks = false;
            this._attackDamage = 0;
            this._attackDamageMax = 0;
            this._attackRange = 0;
            this._attackRangeMax = 0;
            this._doesntAttackLongRange = true;
        }
    }

    update(unit) {
        this._unit = unit;
    }

    type() {
        return this._type;
    }

    possibleTypes() {
        return this._possibleTypes;
    }

    isBound() {
        return this._unit.isBound();
    }

    isEnemy() {
        return this._unit.isEnemy();
    }

    hurt(damage) {
        if (this.isAlive()) {
            this._damage += damage;

            if (!this.square().isUnit()) {
                this.kill();
            }

            this._inferProperties();
        }
    }

    health() {
        return this._maxHealth && Math.max(0, this._maxHealth - this._damage);
    }

    damage() {
        return this._damage;
    }

    isAlive() {
        return this._state === 'alive';
    }

    kill() {
        this._state = 'dead';
        this._square._deadUnits.push(this._simulacrum);
        this._square._simulacrum = null;
    }

    rescue() {
        this._state = 'rescued';
        this._square._rescuedUnits.push(this._simulacrum);
        this._square._simulacrum = null;
    }

    square() {
        return this._square;
    }

    itsNotA(type) {
        this._possibleTypes.delete(type);
        this._inferProperties();
    }

    itAttacksFromDist(value, damage, dist) {
        if (value) {
            this._attacks = true;

            if (damage != null) {
                this._attackDamage = damage;
            }

            if (dist > 1) {
                this._attackRange = 3;
            }
        } else {
            if (dist === 1) {
                this._attacks = false;
                this._attackDamage = 0;
                this._attackRange = 0;
            } else if (dist <= 3) {
                this._doesntAttackLongRange = true;
            }
        }

        if (this._attacks === true && this._doesntAttackLongRange === true) {
            this._attackRange = 1;
        }

        this._inferProperties();
    }

    attacks() {
        return this._attacks;
    }

    attackDamage() {
        return this._attackDamage;
    }

    attackDamageMax() {
        return this._attackDamageMax;
    }

    attackRange() {
        return this._attackRange;
    }

    attackRangeMax() {
        return this._attackRangeMax;
    }

    _inferProperties() {
        if (this._possibleTypes.size !== 1) {
            // Remove possibilities based on whether it attacks.
            if (this._attacks === false) {
                this._possibleTypes.delete('archer');
                this._possibleTypes.delete('wizard');
            }

            // Remove possibilities based on attack range.
            if (this._attackRange === 1
                || this._doesntAttackLongRange === true) {
                this._possibleTypes.delete('archer');
                this._possibleTypes.delete('wizard');
            } else if (this._attackRange === 3) {
                this._possibleTypes.delete('sludge');
                this._possibleTypes.delete('thick-sludge');
            }

            // Remove possibilities based on attack damage.
            if (this._attackDamage === 3) {
                this._possibleTypes.delete('wizard');
            } else if (this._attackDamage === 11) {
                this._possibleTypes.delete('sludge');
                this._possibleTypes.delete('thick-sludge');
                this._possibleTypes.delete('archer');
            }

            // Remove possibilities based on damage sustained.
            if (this.isAlive()) {
                if (this._damage >= 3) {
                    this._possibleTypes.delete('wizard');
                }

                if (this._damage >= 7) {
                    this._possibleTypes.delete('archer');
                }

                if (this._damage >= 12) {
                    this._possibleTypes.delete('sludge');
                }
            } else {
                if (this._damage < 7) {
                    // It's a wizard.
                    this._possibleTypes.delete('sludge');
                    this._possibleTypes.delete('thick-sludge');
                    this._possibleTypes.delete('archer');
                } else if (7 <= this._damage && this._damage < 12) {
                    // It's an archer.
                    this._possibleTypes.delete('sludge');
                    this._possibleTypes.delete('thick-sludge');
                    this._possibleTypes.delete('wizard');
                } else if (12 <= this._damage && this._damage < 24) {
                    // It's a sludge.
                    this._possibleTypes.delete('thick-sludge');
                    this._possibleTypes.delete('archer');
                    this._possibleTypes.delete('wizard');
                } else {
                    // It's a thick sludge.
                    this._possibleTypes.delete('sludge');
                    this._possibleTypes.delete('archer');
                    this._possibleTypes.delete('wizard');
                }
            }
        }

        // Infer all properties when I've whittled the possiblities down to one.
        if (this._possibleTypes.size === 1) {
            this._type = this._possibleTypes.values().next().value;

            if (this._type === 'sludge') {
                this._maxHealth = 12;
                this._attackDamageMax = 3;

                if (this._attacks) {
                    this._attackDamage = 3;
                    this._attackRange = 1;
                }
            } else if (this._type === 'thick-sludge') {
                this._maxHealth = 24;
                this._attackDamageMax = 3;

                if (this._attacks) {
                    this._attackDamage = 3;
                    this._attackRange = 1;
                }
            } else if (this._type === 'archer') {
                this._maxHealth = 7;
                this._attacks = true;
                this._attackDamage = 3;
                this._attackDamageMax = 3;
                this._attackRange = 3;
            } else if (this._type === 'wizard') {
                this._maxHealth = 3;
                this._attacks = true;
                this._attackDamage = 11;
                this._attackDamageMax = 11;
                this._attackRange = 3;
            }
        }

        // Check if I'm dealing with a ranged enemy.
        if (this._possibleTypes.size === 2) {
            if (this._possibleTypes.has('wizard')) {
                if (this._possibleTypes.has('archer')) {
                    this._attacks = true;
                    this._attackRange = 3;
                }
            }
        }

        // Try to infer some properties even when there are still many possibilities.
        if (this._possibleTypes.size >= 2) {
            if (!this._possibleTypes.has('wizard')) {
                this._attackDamageMax = 3;

                if (!this._possibleTypes.has('archer')) {
                    this._attackRange = 1;
                }

                if (this._attacks === true) {
                    this._attackDamage = 3;
                }
            }
        }

        // Cleanup.
        if (this._doesntAttackLongRange) {
            this._attackRangeMax = 1;
            this._attackDamageMax = 3;
        }

        if (this._attackRange != null) {
            this._attackRangeMax = this._attackRange;
        }

        if (this._attacks === false) {
            this._attackDamage = 0;
            this._attackDamageMax = 0;
            this._attackRange = 0;
        }
    }
}

class Walker {
    constructor(mentalMap) {
        this.dir = mentalMap.dir;
        this.oppDir = mentalMap.oppDir;
        this.curr = mentalMap.curr;
    }

    forward() {
        return this.walk('forward');
    }

    backward() {
        return this.walk('backward');
    }

    walk(relDir) {
        const dir = relDir === 'backward' ? this.oppDir : this.dir;
        let nextSquare = this.curr[dir];

        if (nextSquare) {
            this.curr = nextSquare;
        }

        return nextSquare;
    }
}
