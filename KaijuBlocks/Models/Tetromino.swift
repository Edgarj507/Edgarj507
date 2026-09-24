import Foundation

enum PieceType: CaseIterable {
    case t, i, s, z, l, j, o
}

struct Tetromino {
    let type: PieceType
    var cells: [[Int]] // 0 = empty, >0 = color index

    static func spawn(_ type: PieceType) -> Tetromino {
        Tetromino(type: type, cells: Self.shape(for: type))
    }

    private static func shape(for type: PieceType) -> [[Int]] {
        switch type {
        case .t: return [[0,1,0],[1,1,1],[0,0,0]]
        case .i: return [[0,0,0,0],[2,2,2,2],[0,0,0,0],[0,0,0,0]]
        case .s: return [[0,3,3],[3,3,0],[0,0,0]]
        case .z: return [[4,4,0],[0,4,4],[0,0,0]]
        case .l: return [[0,0,5],[5,5,5],[0,0,0]]
        case .j: return [[6,0,0],[6,6,6],[0,0,0]]
        case .o: return [[0,7,7,0],[0,7,7,0],[0,0,0,0],[0,0,0,0]]
        }
    }

    // Matches JS: N = size-1, out[i][j] = matrix[N-j][i]
    func rotated() -> Tetromino {
        let n = cells.count - 1
        var result = cells
        for i in 0..<cells.count {
            for j in 0..<cells[i].count {
                result[i][j] = cells[n - j][i]
            }
        }
        return Tetromino(type: type, cells: result)
    }
}

struct PieceBag {
    private var queue: [PieceType] = []

    mutating func next() -> PieceType {
        if queue.isEmpty { queue = PieceType.allCases.shuffled() }
        return queue.removeFirst()
    }
}
