import { randn } from './utils.js'

export class NeuralNet {
  constructor(inputSize, hiddenSize, outputSize) {
    this.inputSize = inputSize
    this.hiddenSize = hiddenSize
    this.outputSize = outputSize

    this.weightsIH = this.randomMatrix(inputSize, hiddenSize)
    this.biasH = this.randomVector(hiddenSize)
    this.weightsHO = this.randomMatrix(hiddenSize, outputSize)
    this.biasO = this.randomVector(outputSize)

    this.lastHidden = null;
  }

  randomMatrix(rows, cols) {
    const matrix = []
    for (let i = 0; i < rows; i++) {
      matrix[i] = []
      for (let j = 0; j < cols; j++) {
        matrix[i][j] = randn() * 0.5
      }
    }
    return matrix
  }

  randomVector(size) {
    const vector = []
    for (let i = 0; i < size; i++) {
      vector[i] = randn() * 0.5
    }
    return vector
  }

  forward(inputs) {
    this.lastHidden = []
    for (let i = 0; i < this.hiddenSize; i++) {
      let sum = this.biasH[i]
      for (let j = 0; j < this.inputSize; j++) {
        sum += inputs[j] * this.weightsIH[j][i]
      }
      this.lastHidden[i] = Math.max(0, sum)  // ReLU
    }

    const outputs = []
    for (let i = 0; i < this.outputSize; i++) {
      let sum = this.biasO[i]
      for (let j = 0; j < this.hiddenSize; j++) {
        sum += this.lastHidden[j] * this.weightsHO[j][i]
      }
      outputs[i] = Math.max(0, Math.min(1, sum))
    }

    return outputs
  }

  clone() {
    const copy = new NeuralNet(this.inputSize, this.hiddenSize, this.outputSize)

    copy.weightsIH = this.weightsIH.map(row => [...row])
    copy.biasH = [...this.biasH]
    copy.weightsHO = this.weightsHO.map(row => [...row])
    copy.biasO = [...this.biasO]

    return copy
  }

  zero() {
    for (let i = 0; i < this.weightsIH.length; i++) {
      for (let j = 0; j < this.weightsIH[i].length; j++) {
        this.weightsIH[i][j] = 0
      }
    }
    for (let i = 0; i < this.biasH.length; i++) {
      this.biasH[i] = 0
    }
    for (let i = 0; i < this.weightsHO.length; i++) {
      for (let j = 0; j < this.weightsHO[i].length; j++) {
        this.weightsHO[i][j] = 0
      }
    }
    for (let i = 0; i < this.biasO.length; i++) {
      this.biasO[i] = 0
    }
  }

  mutate(rate) {
    const mutateValue = (val) => {
      if (Math.random() < rate) {
        return val + randn() * 0.06
      }
      return val
    }

    for (let i = 0; i < this.weightsIH.length; i++) {
      for (let j = 0; j < this.weightsIH[i].length; j++) {
        this.weightsIH[i][j] = mutateValue(this.weightsIH[i][j])
      }
    }

    for (let i = 0; i < this.biasH.length; i++) {
      this.biasH[i] = mutateValue(this.biasH[i])
    }

    for (let i = 0; i < this.weightsHO.length; i++) {
      for (let j = 0; j < this.weightsHO[i].length; j++) {
        this.weightsHO[i][j] = mutateValue(this.weightsHO[i][j])
      }
    }

    for (let i = 0; i < this.biasO.length; i++) {
      this.biasO[i] = mutateValue(this.biasO[i])
    }
  }

  learn(inputs, outputs, reward) {
    const lr = 0.001 * reward

    const hidden = this.lastHidden

    for (let h = 0; h < this.hiddenSize; h++) {
      for (let i = 0; i < this.inputSize; i++) {
        this.weightsIH[i][h] += lr * inputs[i] * hidden[h]
      }
      this.biasH[h] += lr * hidden[h]
    }

    for (let o = 0; o < this.outputSize; o++) {
      for (let h = 0; h < this.hiddenSize; h++) {
        this.weightsHO[h][o] += lr * hidden[h] * outputs[o]
      }
      this.biasO[o] += lr * outputs[o]
    }
  }

  toJSON() {
    return {
      inputSize: this.inputSize,
      hiddenSize: this.hiddenSize,
      outputSize: this.outputSize,
      weightsIH: this.weightsIH,
      weightsHO: this.weightsHO,
      biasH: this.biasH,
      biasO: this.biasO
    }
  }

  static fromJSON(data) {
    const net = new NeuralNet(data.inputSize, data.hiddenSize, data.outputSize)
    net.weightsIH = data.weightsIH
    net.weightsHO = data.weightsHO
    net.biasH = data.biasH
    net.biasO = data.biasO
    return net
  }
}