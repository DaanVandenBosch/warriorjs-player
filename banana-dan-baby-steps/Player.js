/**
 * Don't hate this guy, hate the game.
 */
class Player {
    constructor() {
        this.turn = 0;
        this.warrior = new SmartWarrior();
    }

    playTurn(warrior) {
        ++this.turn;
        warrior = this.warrior.update(warrior);
        this.warrior.thinkAboutMentalMap();

        if (this.turn === 1) {
            warrior.pivot();
            return;
        }

        const walk = warrior.mentalMap.mentalWalk();
        const nextSquare = walk.forward();

        if (
            warrior.health() <= 11
            && warrior.isTakingDamage()
            && !enemiesBehind(warrior.mentalMap)
        ) {
            warrior.walk('backward');
            return;
        }

        if (warrior.health() <= 18 && !warrior.isTakingDamage()) {
            warrior.rest();
            return;
        }

        if (nextSquare.isWall()) {
            warrior.pivot();
            return;
        }

        if (nextSquare.isUnit()) {
            if (nextSquare.getUnit().isEnemy()) {
                warrior.attack();
                return;
            } else if (nextSquare.getUnit().isBound()) {
                warrior.rescue();
                return;
            }
        }

        // Check the squares ahead for captives, enemies and stairs.
        let square = null;
        let i = 0;

        while ((square = walk.forward()) && i++ < 2) {
            // Walk towards captives and shoot enemies.
            if (square.isUnit()) {
                if (square.getUnit().isBound()) {
                    break;
                } else if (square.getUnit().isEnemy()) {
                    warrior.shoot();
                    return;
                }
            }

            // If we get this far and we find stairs then we walk toward them, except when we haven't fully completed the area yet.
            // In that case we pivot and kick more ass.
            if (square.isStairs() && !warrior.mentalMap.isCompleted()) {
                warrior.pivot();
                return;
            }
        }

        warrior.walk();
    }
}

function enemiesBehind(mentalMap) {
    const walk = mentalMap.mentalWalk();
    let square = null;
    let i = 0;

    while ((square = walk.backward()) && i++ < 3) {
        if (square.isUnit() && square.getUnit().isEnemy()) {
            return true;
        }
    }

    return false;
}

/**
 * Knows which direction he's travelling in, whether or not he's being shot at and other life-prolonging things.
 */
class SmartWarrior {
    constructor() {
        this.warrior = null;
        this.mentalMap = new MentalMap();
    }

    update(warrior) {
        this.warrior = warrior;
        this._prevHealth = this._health;
        this._health = this.health();
        this._takingDamage = this._health < this._prevHealth;

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

        return this;
    }

    rescue(relDir) {
        this.warrior.rescue(relDir);

        this.mentalMap.mentalWalk()
            .forward()
            .rescue();
    }

    rest() {
        this.warrior.rest();
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

        return this;
    }

    walk(relDir) {
        this.warrior.walk(relDir);
        this.mentalMap.walk(relDir);
        return this;
    }

    // Senses

    health() {
        return this.warrior.health();
    }

    isTakingDamage() {
        return this._takingDamage;
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

    isCompleted() {
        const arr = this.toArray();
        const first = arr[0];
        const last = arr[arr.length - 1];

        if (
            !(first.isWall() || first.isStairs())
            || !(last.isWall() || last.isStairs())
        ) {
            return false;
        }

        return !arr.some(sq => sq.isUnit());
    }

    walk(relDir) {
        const dir = relDir === 'backward' ? this.oppDir : this.dir;

        if (this.curr[dir]) {
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
                        return 'X'
                    }
                } else if (sq.rescuedUnits().length) {
                    return 'R';
                } else if (sq.killedUnits().length) {
                    return 'k';
                } else if (sq.isStairs()) {
                    return '>';
                } else if (sq.isWall()) {
                    return '║';
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
        this._killedUnits = [];
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
                    this._simulacrum = new Simulacrum(space.getUnit());
                }
            } else if (this.isUnit()) {
                if (this._simulacrum.isEnemy()) {
                    this._killedUnits.push(this._simulacrum);
                } else {
                    this._rescuedUnits.push(this._simulacrum);
                }

                this._simulacrum = null;
            }
        }
    }

    rescue() {
        if (this._simulacrum && this._simulacrum.isBound()) {
            this._rescuedUnits.push(this._simulacrum);
            this._simulacrum = null;
        }
    }

    isUnit() {
        return this._simulacrum != null;
    }

    rescuedUnits() {
        return this._rescuedUnits;
    }

    killedUnits() {
        return this._killedUnits;
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
}

/**
 * Simulates a unit.
 */
class Simulacrum {
    constructor(unit) {
        this._damage = 0;
        this.update(unit);
    }

    update(unit) {
        this._unit = unit;
    }

    isBound() {
        return this._unit.isBound();
    }

    isEnemy() {
        return this._unit.isEnemy();
    }

    hurt(damage) {
        this._damage += damage;
    }

    damage() {
        return this._damage;
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
