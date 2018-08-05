class Player {
    constructor() {
        this.warrior = new SmartWarrior();
    }

    playTurn(game_warrior) {
        const warrior = this.warrior.update(game_warrior);

        const enemy = enemies_around(warrior)[0]

        if (enemy) {
            warrior.attack(warrior.mental_map.dir_to(enemy.square));
        } else {
            warrior.walk_toward_stairs();
        }
    }
}

function enemies_around(warrior) {
    return ORIENTATIONS
        .map(ori => warrior.mental_map.curr[ori])
        .filter(square => square && square.unit && square.unit.is_enemy)
        .map(square => square.unit);
}

/**
 * Knows which direction he's travelling in, whether or not he's being shot at and other life-prolonging things.
 */
class SmartWarrior {
    constructor() {
        this.warrior = null;
        this.prev_health = null;
        this.damage_taken = 0;
        this.mental_map = new MentalMap();
        this.actions_taken = [];
    }

    update(warrior) {
        this.warrior = warrior;
        this.damage_taken = Math.max(
            0,
            (this.prev_health || 20) - this.health
        );
        this.prev_health = this.health;

        this.mental_map.update(DIRECTIONS.map(dir => [warrior.feel(dir)]));
        return this;
    }

    // Actions

    walk(dir) {
        this.warrior.walk(dir);
    }

    walk_toward_stairs() {
        this.warrior.walk(this.direction_of_stairs);
    }

    attack(dir) {
        this.warrior.attack(dir);

        const square = this.mental_map.mental_walk().walk(dir);

        if (square.unit) {
            square.unit.hurt(5);
        }

        this.actions_taken.push({ type: 'attack', dir });

        return this;
    }

    // Senses

    get health() {
        return this.warrior.health();
    }

    get direction_of_stairs() {
        this.warrior.directionOfStairs();
    }
}
/**
 * Mental map of the current area.
 */
class MentalMap {
    constructor() {
        // Orientation.
        this.ori = 'west';
        // The square I'm currently on.
        this.curr = new Square(0, 0);
        this.squares = [[this.curr]];
    }

    update(spaces_around) {
        spaces_around.forEach((spaces, i) => {
            this._update(rotate(this.ori, DIRECTIONS[i]), spaces);
        }, this);
    }

    _update(ori, spaces) {
        const x_inc = ori === 'east' ? 1 : ori === 'west' ? -1 : 0;
        const y_inc = ori === 'north' ? 1 : ori === 'south' ? -1 : 0;
        const opp_ori = rotate(ori, 'south');
        let square = this.curr;

        for (const space of spaces) {
            let next_square = square[ori];

            if (next_square) {
                next_square.update(space);
            } else {
                next_square = new Square(
                    square.x + x_inc,
                    square.y + y_inc,
                    space
                );
                next_square[opp_ori] = square;

                square[ori] = next_square;
            }

            square = next_square;
        }
    }

    walk(dir) {
        const ori = rotate(this.ori, dir);

        if (this.curr[ori] && this.curr[ori].is_empty) {
            this.curr = this.curr[ori];
        }
    }

    mental_walk() {
        return new Walker(this);
    }

    dir_to(square) {
        const x_diff = square.x - this.curr.x;
        const y_diff = square.y - this.curr.y;

        if (Math.abs(x_diff) >= Math.abs(y_diff)) {
            if (x_diff >= 0) {
                return direction(this.ori, 'east');
            } else {
                return direction(this.ori, 'west');
            }
        } else {
            if (y_diff >= 0) {
                return direction(this.ori, 'north');
            } else {
                return direction(this.ori, 'south');
            }
        }
    }
}

/**
 * A single space on the map.
 */
class Square {
    constructor(x, y, space) {
        this.x = x;
        this.y = y;
        this.space = null
        this.north = null;
        this.west = null;
        this.south = null;
        this.east = null;
        this.unit = null;
        this.rescued_units = [];
        this.dead_units = [];
        this.update(space);
    }

    update(space) {
        this.space = space;

        if (space) {
            if (space.isUnit()) {
                if (this.unit) {
                    this.unit.update(space.getUnit());
                } else {
                    this.unit = new Simulacrum(space.getUnit(), this);
                }
            } else if (this.unit) {
                // If we enter this case, our mental map is off... this shouldn't happen.
                if (this.unit.is_enemy) {
                    this.unit.kill();
                } else {
                    this.unit.rescue();
                }

                this.unit = null;
            }
        }
    }

    get is_wall() {
        return this.space != null && this.space.isWall();
    }

    get is_empty() {
        return this.unit == null && !this.is_wall;
    }
}

/**
 * Simulates a unit.
 */
class Simulacrum {
    constructor(unit, square) {
        this.damage = 0;
        this.state = 'alive';
        this.square = square;
        this.update(unit);

        if (this.is_enemy) {
            this.possible_types = new Set([
                'sludge',
                'thick-sludge',
                'archer',
                'wizard'
            ]);
            this.type = null;
            this.max_health = null;
            this.attacks = null;
            this.attack_damage = null;
            this.attack_damage_max = 11;
            this.attack_range = null;
            this.attack_range_max = 3;
            this._doesnt_attack_long_range = null;
        } else {
            this.possible_types = new Set([
                'captive'
            ]);
            this.type = 'captive';
            this.max_health = 1;
            this.attacks = false;
            this.attack_damage = 0;
            this.attack_damage_max = 0;
            this.attack_range = 0;
            this.attack_range_max = 0;
            this._doesnt_attack_long_range = true;
        }
    }

    update(unit) {
        this.unit = unit;
    }

    get is_bound() {
        return this.unit.isBound();
    }

    get is_enemy() {
        return this.unit.isEnemy();
    }

    get is_alive() {
        return this.state === 'alive';
    }

    get health() {
        return this.max_health && Math.max(0, this.max_health - this.damage);
    }

    hurt(damage) {
        if (this.is_alive) {
            this.damage += damage;

            if (!this.square.space.isUnit()) {
                this.kill();
            }

            this._infer_properties();
        }
    }

    kill() {
        this.state = 'dead';
        this.square.dead_units.push(this);
        this.square.unit = null;
    }

    rescue() {
        this.state = 'rescued';
        this.square.rescued_units.push(this);
        this.square.unit = null;
    }

    its_not_a(type) {
        this.possible_types.delete(type);
        this._infer_properties();
    }

    it_attacks_from_dist(attacks, damage, dist) {
        if (attacks) {
            this.attacks = true;

            if (damage != null) {
                this.attack_damage = damage;
            }

            if (dist > 1) {
                this.attack_range = 3;
            }
        } else {
            if (dist === 1) {
                this.attacks = false;
                this.attack_damage = 0;
                this.attack_range = 0;
            } else if (dist <= 3) {
                this._doesnt_attack_long_range = true;
            }
        }

        if (this.attacks === true && this._doesnt_attack_long_range === true) {
            this.attack_range = 1;
        }

        this._infer_properties();
    }

    _infer_properties() {
        if (this.possible_types.size !== 1) {
            // Remove possibilities based on whether it attacks.
            if (this.attacks === false) {
                this.possible_types.delete('archer');
                this.possible_types.delete('wizard');
            }

            // Remove possibilities based on attack range.
            if (this.attack_range === 1
                || this._doesnt_attack_long_range === true) {
                this.possible_types.delete('archer');
                this.possible_types.delete('wizard');
            } else if (this.attack_range === 3) {
                this.possible_types.delete('sludge');
                this.possible_types.delete('thick-sludge');
            }

            // Remove possibilities based on attack damage.
            if (this.attack_damage === 3) {
                this.possible_types.delete('wizard');
            } else if (this.attack_damage === 11) {
                this.possible_types.delete('sludge');
                this.possible_types.delete('thick-sludge');
                this.possible_types.delete('archer');
            }

            // Remove possibilities based on damage sustained.
            if (this.is_alive) {
                if (this.damage >= 3) {
                    this.possible_types.delete('wizard');
                }

                if (this.damage >= 7) {
                    this.possible_types.delete('archer');
                }

                if (this.damage >= 12) {
                    this.possible_types.delete('sludge');
                }
            } else {
                if (this.damage < 7) {
                    // It's a wizard.
                    this.possible_types.delete('sludge');
                    this.possible_types.delete('thick-sludge');
                    this.possible_types.delete('archer');
                } else if (7 <= this.damage && this.damage < 12) {
                    // It's an archer.
                    this.possible_types.delete('sludge');
                    this.possible_types.delete('thick-sludge');
                    this.possible_types.delete('wizard');
                } else if (12 <= this.damage && this.damage < 24) {
                    // It's a sludge.
                    this.possible_types.delete('thick-sludge');
                    this.possible_types.delete('archer');
                    this.possible_types.delete('wizard');
                } else {
                    // It's a thick sludge.
                    this.possible_types.delete('sludge');
                    this.possible_types.delete('archer');
                    this.possible_types.delete('wizard');
                }
            }
        }

        // Infer all properties when I've whittled the possiblities down to one.
        if (this.possible_types.size === 1) {
            this.type = this.possible_types.values().next().value;

            if (this.type === 'sludge') {
                this.max_health = 12;
                this.attack_damage_max = 3;

                if (this.attacks) {
                    this.attack_damage = 3;
                    this.attack_range = 1;
                }
            } else if (this.type === 'thick-sludge') {
                this.max_health = 24;
                this.attack_damage_max = 3;

                if (this.attacks) {
                    this.attack_damage = 3;
                    this.attack_range = 1;
                }
            } else if (this.type === 'archer') {
                this.max_health = 7;
                this.attacks = true;
                this.attack_damage = 3;
                this.attack_damage_max = 3;
                this.attack_range = 3;
            } else if (this.type === 'wizard') {
                this.max_health = 3;
                this.attacks = true;
                this.attack_damage = 11;
                this.attack_damage_max = 11;
                this.attack_range = 3;
            }
        }

        // Check if I'm dealing with a ranged enemy.
        if (this.possible_types.size === 2) {
            if (this.possible_types.has('wizard')) {
                if (this.possible_types.has('archer')) {
                    this.attacks = true;
                    this.attack_range = 3;
                }
            }
        }

        // Try to infer some properties even when there are still many possibilities.
        if (this.possible_types.size >= 2) {
            if (!this.possible_types.has('wizard')) {
                this.attack_damage_max = 3;

                if (!this.possible_types.has('archer')) {
                    this.attack_range = 1;
                }

                if (this.attacks === true) {
                    this.attack_damage = 3;
                }
            }
        }

        // Cleanup.
        if (this._doesnt_attack_long_range) {
            this.attack_range_max = 1;
            this.attack_damage_max = 3;
        }

        if (this.attack_range != null) {
            this.attack_range_max = this.attack_range;
        }

        if (this.attacks === false) {
            this.attack_damage = 0;
            this.attack_damage_max = 0;
            this.attack_range = 0;
        }
    }
}

class Walker {
    constructor(mental_map) {
        // Orientation.
        this.ori = mental_map.ori;
        // The square I'm currently (mentally) on.
        this.curr = mental_map.curr;
    }

    forward() {
        return this.walk('forward');
    }

    backward() {
        return this.walk('backward');
    }

    walk(dir) {
        const ori = rotate(this.ori, dir);
        const next_square = this.curr[ori];

        if (next_square) {
            this.curr = next_square;
        }

        return next_square;
    }
}

const ORIENTATIONS = ['north', 'east', 'south', 'west'];
const DIRECTIONS = ['forward', 'right', 'backward', 'left'];

function rotate(ori, dir) {
    const ori_i = ORIENTATIONS.indexOf(ori);
    const dir_i = DIRECTIONS.indexOf(dir);
    return ORIENTATIONS[(ori_i + dir_i) % 4];
}

function direction(from_ori, to_ori) {
    const from_i = ORIENTATIONS.indexOf(from_ori);
    const to_i = ORIENTATIONS.indexOf(to_ori);
    return DIRECTIONS[(4 + to_i - from_i) % 4];
}
