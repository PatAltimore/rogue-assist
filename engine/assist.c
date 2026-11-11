/*
 * assist.c -- read-only views of the live game for the web sidebar, plus the
 * cheats it offers. Cheats run from inside getch() (see curses_shim.c), i.e.
 * on the game's own stack, so they may safely call msg(), new_level(), etc.
 */
#include <stdarg.h>
#include <string.h>
#include <emscripten.h>
#include "curses.h"
#include "rogue.h"

/* Cheat codes (keep in step with web/js/cheats.js). */
#define CH_HEAL      1
#define CH_FEED      2
#define CH_STRENGTH  3
#define CH_LEVELUP   4
#define CH_DESCEND   5
#define CH_ASCEND    6
#define CH_MAP       7
#define CH_IDENTIFY  8
#define CH_GOLD      9
#define CH_REGEN     10

static int cheated;
int assist_at_command;          /* 1 while waiting at the top-level command prompt */
extern int shim_overlay;        /* 1 while a window other than stdscr is on screen */

/* ---- stats ---------------------------------------------------------- */

EMSCRIPTEN_KEEPALIVE int assist_at_prompt(void) { return assist_at_command; }
EMSCRIPTEN_KEEPALIVE int assist_text_overlay(void) { return shim_overlay; }
EMSCRIPTEN_KEEPALIVE int assist_ingame(void) { return stdscr != NULL && playing; }
EMSCRIPTEN_KEEPALIVE int assist_cheated(void) { return cheated || noscore; }
EMSCRIPTEN_KEEPALIVE int assist_level(void) { return level; }
EMSCRIPTEN_KEEPALIVE int assist_max_level(void) { return max_level; }
EMSCRIPTEN_KEEPALIVE int assist_hp(void) { return pstats.s_hpt; }
EMSCRIPTEN_KEEPALIVE int assist_max_hp(void) { return max_hp; }
EMSCRIPTEN_KEEPALIVE int assist_str(void) { return pstats.s_str; }
EMSCRIPTEN_KEEPALIVE int assist_max_str(void) { return max_stats.s_str; }
EMSCRIPTEN_KEEPALIVE int assist_ac(void) { return pstats.s_arm; }
EMSCRIPTEN_KEEPALIVE int assist_xp_level(void) { return pstats.s_lvl; }
EMSCRIPTEN_KEEPALIVE int assist_xp(void) { return pstats.s_exp; }
EMSCRIPTEN_KEEPALIVE int assist_gold(void) { return purse; }
EMSCRIPTEN_KEEPALIVE int assist_food(void) { return food_left; }
EMSCRIPTEN_KEEPALIVE int assist_hunger(void) { return hungry_state; }
EMSCRIPTEN_KEEPALIVE int assist_has_amulet(void) { return amulet; }
EMSCRIPTEN_KEEPALIVE int assist_hero_y(void) { return hero.y; }
EMSCRIPTEN_KEEPALIVE int assist_hero_x(void) { return hero.x; }
EMSCRIPTEN_KEEPALIVE int assist_flags(void) { return player.t_flags; }

/* ---- pack ----------------------------------------------------------- */

static THING *pack_nth(int n)
{
    THING *t;
    for (t = pack; t != NULL && n > 0; t = next(t))
        n--;
    return t;
}

EMSCRIPTEN_KEEPALIVE int assist_pack_count(void)
{
    int n = 0;
    THING *t;
    for (t = pack; t != NULL; t = next(t))
        n++;
    return n;
}

EMSCRIPTEN_KEEPALIVE int assist_pack_letter(int i)
{
    THING *t = pack_nth(i);
    return t ? t->o_packch : 0;
}

EMSCRIPTEN_KEEPALIVE int assist_pack_type(int i)
{
    THING *t = pack_nth(i);
    return t ? t->o_type : 0;
}

EMSCRIPTEN_KEEPALIVE int assist_pack_which(int i)
{
    THING *t = pack_nth(i);
    return t ? t->o_which : 0;
}

EMSCRIPTEN_KEEPALIVE int assist_pack_count_of(int i)
{
    THING *t = pack_nth(i);
    return t ? t->o_count : 0;
}

EMSCRIPTEN_KEEPALIVE int assist_pack_known(int i)
{
    THING *t = pack_nth(i);
    return t ? (t->o_flags & ISKNOW) != 0 : 0;
}

EMSCRIPTEN_KEEPALIVE int assist_armor_worn(void) { return cur_armor != NULL; }
EMSCRIPTEN_KEEPALIVE int assist_weapon_wielded(void) { return cur_weapon != NULL; }

/* bit 0 = wielded/worn, bit 1 = on a ring finger */
EMSCRIPTEN_KEEPALIVE int assist_pack_equipped(int i)
{
    THING *t = pack_nth(i);
    if (t == NULL)
        return 0;
    if (t == cur_weapon || t == cur_armor)
        return 1;
    if (t == cur_ring[LEFT] || t == cur_ring[RIGHT])
        return 2;
    return 0;
}

EMSCRIPTEN_KEEPALIVE const char *assist_pack_name(int i)
{
    static char buf[128];
    THING *t = pack_nth(i);
    if (t == NULL)
        return "";
    strncpy(buf, inv_name(t, FALSE), sizeof buf - 1);
    buf[sizeof buf - 1] = '\0';
    return buf;
}

/* ---- level map (only what the hero has seen) ------------------------ */

/* The map cell as the hero remembers it, or 0 if blank/unexplored. */
EMSCRIPTEN_KEEPALIVE int assist_cell(int y, int x)
{
    int ch;

    if (stdscr == NULL || y < 1 || y >= NUMLINES - 1 || x < 0 || x >= NUMCOLS)
        return 0;
    /* stdscr is the game's own memory of the level (row 0 is messages). */
    /* Read the cell directly: wmove() would mark stdscr changed and make the
     * next getch() repaint it over any pop-up the game is showing. */
    ch = stdscr->_base[y * stdscr->_stride + x] & A_CHARTEXT;
    return ch == ' ' ? 0 : ch;
}

EMSCRIPTEN_KEEPALIVE int assist_stairs_known(void) { return seenstairs; }
EMSCRIPTEN_KEEPALIVE int assist_stairs_y(void) { return stairs.y; }
EMSCRIPTEN_KEEPALIVE int assist_stairs_x(void) { return stairs.x; }

/* ---- monsters ------------------------------------------------------- */

static THING *monster_nth(int n, int visible_only)
{
    THING *t;
    for (t = mlist; t != NULL; t = next(t)) {
        if (visible_only && (!cansee(t->t_pos.y, t->t_pos.x) ||
                             (on(*t, ISINVIS) && !on(player, CANSEE))))
            continue;
        if (n-- == 0)
            return t;
    }
    return NULL;
}

/* visible_only = 1: what the hero can currently see; 0: radar cheat. */
EMSCRIPTEN_KEEPALIVE int assist_monster_count(int visible_only)
{
    int n = 0;
    while (monster_nth(n, visible_only) != NULL)
        n++;
    return n;
}

EMSCRIPTEN_KEEPALIVE int assist_monster_type(int i, int visible_only)
{
    THING *t = monster_nth(i, visible_only);
    return t ? t->t_type : 0;
}

EMSCRIPTEN_KEEPALIVE int assist_monster_y(int i, int visible_only)
{
    THING *t = monster_nth(i, visible_only);
    return t ? t->t_pos.y : 0;
}

EMSCRIPTEN_KEEPALIVE int assist_monster_x(int i, int visible_only)
{
    THING *t = monster_nth(i, visible_only);
    return t ? t->t_pos.x : 0;
}

EMSCRIPTEN_KEEPALIVE int assist_monster_hp(int i, int visible_only)
{
    THING *t = monster_nth(i, visible_only);
    return t ? t->t_stats.s_hpt : 0;
}

/* ---- identification tables ------------------------------------------ */

/* kind: 0 potion, 1 scroll, 2 ring, 3 wand/staff */
static struct obj_info *info_table(int kind, int *n)
{
    switch (kind) {
    case 0: *n = MAXPOTIONS;  return pot_info;
    case 1: *n = MAXSCROLLS;  return scr_info;
    case 2: *n = MAXRINGS;    return ring_info;
    default: *n = MAXSTICKS;  return ws_info;
    }
}

/* Is this kind of item identified yet? (-1 = out of range) */
EMSCRIPTEN_KEEPALIVE int assist_item_known(int kind, int which)
{
    int n;
    struct obj_info *t = info_table(kind, &n);
    if (which < 0 || which >= n)
        return -1;
    return t[which].oi_know;
}

/* The unidentified label the game assigned (colour, title, stone, wood/metal). */
EMSCRIPTEN_KEEPALIVE const char *assist_item_label(int kind, int which)
{
    static char buf[96];
    int n;
    info_table(kind, &n);
    if (which < 0 || which >= n)
        return "";
    switch (kind) {
    case 0: return p_colors[which];
    case 1: return s_names[which];
    case 2: return r_stones[which];
    default:
        snprintf(buf, sizeof buf, "%s %s", ws_made[which], ws_type[which]);
        return buf;
    }
}

/* ---- cheats --------------------------------------------------------- */

static void reveal_map(void)
{
    int y, x;
    PLACE *pp;

    for (y = 1; y < NUMLINES - 1; y++)
        for (x = 0; x < NUMCOLS; x++) {
            pp = INDEX(y, x);
            switch (pp->p_ch) {
            case DOOR:
            case STAIRS:
                break;
            case '-':
            case '|':
                if (!(pp->p_flags & F_REAL)) {
                    pp->p_ch = DOOR;
                    pp->p_flags |= F_REAL;
                }
                break;
            case ' ':
                if (pp->p_flags & F_REAL)
                    break;
                pp->p_flags |= F_REAL;
                pp->p_ch = PASSAGE;
                /* FALLTHROUGH */
            case PASSAGE:
                if (!(pp->p_flags & F_REAL))
                    pp->p_ch = PASSAGE;
                pp->p_flags |= (F_SEEN | F_REAL);
                break;
            case FLOOR:
                if (!(pp->p_flags & F_REAL)) {
                    pp->p_ch = TRAP;
                    pp->p_flags |= (F_SEEN | F_REAL);
                }
                break;
            default:
                if (pp->p_flags & F_PASS) {
                    pp->p_flags |= (F_SEEN | F_REAL);
                }
                break;
            }
            if (pp->p_ch != ' ' && (pp->p_flags & F_SEEN)) {
                if (pp->p_monst == NULL || !on(player, SEEMONST))
                    mvaddch(y, x, pp->p_ch);
            } else if (pp->p_ch == DOOR || pp->p_ch == STAIRS) {
                pp->p_flags |= F_SEEN;
                if (pp->p_monst == NULL || !on(player, SEEMONST))
                    mvaddch(y, x, pp->p_ch);
            }
        }
}

static void identify_all(void)
{
    int i;
    THING *t;

    for (i = 0; i < MAXPOTIONS; i++) pot_info[i].oi_know = TRUE;
    for (i = 0; i < MAXSCROLLS; i++) scr_info[i].oi_know = TRUE;
    for (i = 0; i < MAXRINGS; i++)   ring_info[i].oi_know = TRUE;
    for (i = 0; i < MAXSTICKS; i++)  ws_info[i].oi_know = TRUE;
    for (t = pack; t != NULL; t = next(t))
        t->o_flags |= ISKNOW;
}

void assist_cheat(int code)
{
    switch (code) {
    case CH_HEAL:
        pstats.s_hpt = max_hp;
        msg("Cheat: fully healed");
        break;
    case CH_FEED:
        food_left = HUNGERTIME;
        hungry_state = 0;
        msg("Cheat: you are no longer hungry");
        break;
    case CH_STRENGTH:
        pstats.s_str = max_stats.s_str;
        msg("Cheat: strength restored");
        break;
    case CH_LEVELUP:
        raise_level();
        break;
    case CH_DESCEND:
        level++;
        if (level > max_level)
            max_level = level;
        new_level();
        msg("Cheat: you descend");
        break;
    case CH_ASCEND:
        if (level <= 1) {
            msg("Cheat: you can't climb out of the dungeon");
            return;
        }
        level--;
        new_level();
        msg("Cheat: you ascend");
        break;
    case CH_MAP:
        reveal_map();
        msg("Cheat: the level is mapped");
        break;
    case CH_IDENTIFY:
        identify_all();
        msg("Cheat: everything is identified");
        break;
    case CH_GOLD:
        purse += 500;
        msg("Cheat: 500 gold appears in your purse");
        break;
    case CH_REGEN:
        new_level();
        msg("Cheat: a new layout for this level");
        break;
    default:
        return;
    }
    cheated = 1;
    noscore = TRUE; /* same rule as wizard mode: no high-score entry */
    status();
    wrefresh(stdscr);
}
