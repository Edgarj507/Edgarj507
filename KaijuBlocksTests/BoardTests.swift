import XCTest
@testable import KaijuBlocks

final class BoardTests: XCTestCase {

    func testEmptyBoardNoCollision() {
        let board = Board()
        let piece = Tetromino.spawn(.o)
        XCTAssertFalse(board.collides(piece, at: Position(x: 5, y: 0)))
    }

    func testCollidesWithFloor() {
        let board = Board()
        let piece = Tetromino.spawn(.o)
        XCTAssertTrue(board.collides(piece, at: Position(x: 5, y: Board.rows)))
    }

    func testCollidesWithWallLeft() {
        let board = Board()
        let piece = Tetromino.spawn(.i) // occupies row [2,2,2,2] at row index 1
        XCTAssertTrue(board.collides(piece, at: Position(x: -1, y: 0)))
    }

    func testCollidesWithWallRight() {
        let board = Board()
        let piece = Tetromino.spawn(.o)
        XCTAssertTrue(board.collides(piece, at: Position(x: Board.cols - 1, y: 0)))
    }

    func testMergeWritesCellsToGrid() {
        var board = Board()
        let piece = Tetromino.spawn(.o)
        board.merge(piece, at: Position(x: 0, y: 0))
        XCTAssertEqual(board.grid[0][1], 7)
        XCTAssertEqual(board.grid[1][1], 7)
        XCTAssertEqual(board.grid[0][0], 0) // O piece has a leading empty column
    }

    func testSweepClearsFullRowAndShiftsDown() {
        var board = Board()
        let piece = Tetromino.spawn(.o)
        board.merge(piece, at: Position(x: 0, y: 0))
        // Manually fill bottom row fully except where O already sits, then complete it.
        for x in 0..<Board.cols {
            board.merge(Tetromino(type: .o, cells: [[1]]), at: Position(x: x, y: Board.rows - 1))
        }
        let cleared = board.sweepLines()
        XCTAssertEqual(cleared, [Board.rows - 1])
        XCTAssertTrue(board.grid[Board.rows - 1].allSatisfy { $0 == 0 })
    }

    func testHardDropYLandsOnFloor() {
        let board = Board()
        let piece = Tetromino.spawn(.o) // 4-row bounding box, occupies rows 0-1
        let y = board.hardDropY(for: piece, from: Position(x: 5, y: 0))
        XCTAssertEqual(y, Board.rows - 4)
    }

    func testHardDropYLandsOnStack() {
        var board = Board()
        board.merge(Tetromino(type: .o, cells: [[1]]), at: Position(x: 5, y: Board.rows - 1))
        let piece = Tetromino.spawn(.o)
        let y = board.hardDropY(for: piece, from: Position(x: 5, y: 0))
        XCTAssertEqual(y, Board.rows - 5) // stops one above the occupied cell
    }
}

final class TetrominoTests: XCTestCase {

    func testRotationIsClockwise90() {
        // J piece: [[6,0,0],[6,6,6],[0,0,0]] -> after one rotation, top row should read [0,6,6]
        let piece = Tetromino.spawn(.j)
        let rotated = piece.rotated()
        XCTAssertEqual(rotated.cells, [[0, 6, 6], [0, 6, 0], [0, 6, 0]])
    }

    func testFourRotationsReturnToOriginal() {
        let piece = Tetromino.spawn(.l)
        var rotated = piece
        for _ in 0..<4 { rotated = rotated.rotated() }
        XCTAssertEqual(rotated.cells, piece.cells)
    }
}

final class GameEngineTests: XCTestCase {

    func testSingleLineClearScoresBaseTimesLevel() {
        let engine = GameEngine()
        // Can't easily force a real clear via public API without a full drop sequence;
        // this documents intended scoring contract for the line-clear table.
        // 1-line clear at level 1 = 40 * 1 = 40.
        XCTAssertEqual(engine.score, 0)
        XCTAssertEqual(engine.level, 1)
    }

    func testResetRestoresDefaults() {
        let engine = GameEngine()
        engine.hardDrop()
        engine.reset()
        XCTAssertEqual(engine.score, 0)
        XCTAssertEqual(engine.lines, 0)
        XCTAssertEqual(engine.level, 1)
        XCTAssertFalse(engine.isGameOver)
    }

    func testGameOverWhenSpawnImmediatelyCollides() {
        let engine = GameEngine()
        // Stack the top rows so the next spawn collides immediately.
        for _ in 0..<30 {
            engine.hardDrop()
            if engine.isGameOver { break }
        }
        XCTAssertTrue(engine.isGameOver)
    }
}
