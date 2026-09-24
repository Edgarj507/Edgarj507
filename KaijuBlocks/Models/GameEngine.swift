import Foundation
import Combine

/// Pure game-loop orchestrator: owns Board + active piece, no rendering.
final class GameEngine: ObservableObject {
    @Published private(set) var board = Board()
    @Published private(set) var current: Tetromino
    @Published private(set) var currentPos: Position
    @Published private(set) var next: PieceType
    @Published private(set) var score = 0
    @Published private(set) var lines = 0
    @Published private(set) var level = 1
    @Published private(set) var isGameOver = false
    @Published private(set) var lastClearedRows: [Int] = []

    private(set) var dropInterval: Double = 1000 // ms, matches JS default
    private var bag = PieceBag()
    private var dropAccumulator: Double = 0

    init() {
        var bag = PieceBag()
        let first = bag.next()
        let second = bag.next()
        self.bag = bag
        current = Tetromino.spawn(first)
        next = second
        currentPos = Position(x: Self.spawnX(for: Tetromino.spawn(first)), y: 0)
    }

    private static func spawnX(for piece: Tetromino) -> Int {
        Board.cols / 2 - piece.cells[0].count / 2
    }

    // MARK: - Intents

    func move(_ dx: Int) {
        guard !isGameOver else { return }
        let candidate = Position(x: currentPos.x + dx, y: currentPos.y)
        if !board.collides(current, at: candidate) { currentPos = candidate }
    }

    func rotate() {
        guard !isGameOver else { return }
        let rotated = current.rotated()
        var testX = currentPos.x
        var offset = 1
        while board.collides(rotated, at: Position(x: testX, y: currentPos.y)) {
            testX += offset
            offset = -(offset + (offset > 0 ? 1 : -1))
            if abs(offset) > rotated.cells[0].count { return } // no valid kick, abort rotation
        }
        current = rotated
        currentPos.x = testX
    }

    func softDrop() {
        guard !isGameOver else { return }
        let down = Position(x: currentPos.x, y: currentPos.y + 1)
        if board.collides(current, at: down) {
            lockPiece()
        } else {
            currentPos = down
        }
        dropAccumulator = 0
    }

    func hardDrop() {
        guard !isGameOver else { return }
        currentPos.y = board.hardDropY(for: current, from: currentPos)
        lockPiece()
        dropAccumulator = 0
    }

    /// Call once per frame with elapsed ms since last tick.
    func tick(deltaMs: Double) {
        guard !isGameOver else { return }
        dropAccumulator += deltaMs
        if dropAccumulator > dropInterval { softDrop() }
    }

    // MARK: - Internals

    private func lockPiece() {
        board.merge(current, at: currentPos)
        let cleared = board.sweepLines()
        lastClearedRows = cleared
        if !cleared.isEmpty { applyScoring(clearedCount: cleared.count) }
        spawnNext()
    }

    private func applyScoring(clearedCount: Int) {
        lines += clearedCount
        let lineScores = [0, 40, 100, 300, 1200]
        let base = clearedCount < lineScores.count ? lineScores[clearedCount] : lineScores[4]
        score += base * level

        let newLevel = min(100, lines / 10 + 1)
        if newLevel > level {
            level = newLevel
            let startSpeed = 1000.0, endSpeed = 50.0
            let progress = Double(level - 1) / 99.0
            dropInterval = max(endSpeed, startSpeed - (startSpeed - endSpeed) * progress)
        }
    }

    private func spawnNext() {
        current = Tetromino.spawn(next)
        next = bag.next()
        currentPos = Position(x: Self.spawnX(for: current), y: 0)
        if board.collides(current, at: currentPos) {
            isGameOver = true
        }
    }

    func reset() {
        board = Board()
        var freshBag = PieceBag()
        let first = freshBag.next()
        next = freshBag.next()
        bag = freshBag
        current = Tetromino.spawn(first)
        currentPos = Position(x: Self.spawnX(for: current), y: 0)
        score = 0; lines = 0; level = 1
        dropInterval = 1000
        dropAccumulator = 0
        isGameOver = false
        lastClearedRows = []
    }
}
