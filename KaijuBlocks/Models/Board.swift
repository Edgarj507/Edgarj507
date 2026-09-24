import Foundation

struct Position: Equatable {
    var x: Int
    var y: Int
}

struct Board {
    static let cols = 12
    static let rows = 24

    private(set) var grid: [[Int]]

    init() {
        grid = Array(repeating: Array(repeating: 0, count: Self.cols), count: Self.rows)
    }

    func collides(_ piece: Tetromino, at pos: Position) -> Bool {
        for (dy, row) in piece.cells.enumerated() {
            for (dx, value) in row.enumerated() {
                guard value != 0 else { continue }
                let x = pos.x + dx
                let y = pos.y + dy
                if y < 0 || y >= Self.rows || x < 0 || x >= Self.cols { return true }
                if grid[y][x] != 0 { return true }
            }
        }
        return false
    }

    mutating func merge(_ piece: Tetromino, at pos: Position) {
        for (dy, row) in piece.cells.enumerated() {
            for (dx, value) in row.enumerated() {
                guard value != 0 else { continue }
                grid[pos.y + dy][pos.x + dx] = value
            }
        }
    }

    // Returns cleared row indices (pre-sweep, for particle FX hookup) and mutates grid.
    @discardableResult
    mutating func sweepLines() -> [Int] {
        var cleared: [Int] = []
        var y = Self.rows - 1
        while y >= 0 {
            if grid[y].allSatisfy({ $0 > 0 }) {
                cleared.append(y)
                grid.remove(at: y)
                grid.insert(Array(repeating: 0, count: Self.cols), at: 0)
                // don't decrement y: new row shifted into this index needs checking too
            } else {
                y -= 1
            }
        }
        return cleared
    }

    func hardDropY(for piece: Tetromino, from pos: Position) -> Int {
        var testPos = pos
        while !collides(piece, at: Position(x: testPos.x, y: testPos.y + 1)) {
            testPos.y += 1
        }
        return testPos.y
    }
}
